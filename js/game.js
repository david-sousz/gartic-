import { AuthSystem } from './firebase-config.js';

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Configurações do Mundo
        this.MAP_SIZE = 4000;
        this.BOT_COUNT = 30;
        this.FOOD_COUNT = 600;

        // Estado do Jogo
        this.isRunning = false;
        this.myCells = [];
        this.foods = [];
        this.bots = [];
        this.inputVector = { x: 0, y: 0 };
        this.cam = { x: 0, y: 0, zoom: 1, userZoom: 1 };
        this.audioContext = null;
        this.lofiPlaying = false;

        // Inicia Sistemas
        this.auth = new AuthSystem(this);
        this.resize();
        this.initEvents();
        this.loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    // --- CONTROLES E EVENTOS ---
    initEvents() {
        window.addEventListener('resize', () => this.resize());

        // Botões de Menu
        document.getElementById('btnPlay').onclick = () => this.startGame();
        document.getElementById('btnShop').onclick = () => document.getElementById('shopModal').style.display = 'flex';

        // Zoom Slider
        document.getElementById('zoomSlider').oninput = (e) => {
            // Mapeia 10-200 para 0.1-2.0
            this.cam.userZoom = e.target.value / 100;
        };

        // Audio Toggle
        document.getElementById('btnRadioToggle').onclick = () => this.toggleRadio();

        // Ações In-Game
        const btnSplit = document.getElementById('btnSplit');
        const btnEject = document.getElementById('btnEject');
        
        // Use 'touchstart' para resposta rápida no mobile
        btnSplit.addEventListener('touchstart', (e) => { e.preventDefault(); this.split(); });
        btnEject.addEventListener('touchstart', (e) => { e.preventDefault(); this.eject(); });
        // Fallback para click no PC
        btnSplit.onclick = () => this.split(); 
        btnEject.onclick = () => this.eject();

        // --- JOYSTICK MOBILE (CRÍTICO) ---
        const zone = document.getElementById('joystickZone');
        const stick = document.getElementById('joystickStick');
        
        let joyActive = false;
        let joyCenter = { x: 0, y: 0 };
        const maxRadius = zone.offsetWidth / 2;

        const handleMove = (clientX, clientY) => {
            const dx = clientX - joyCenter.x;
            const dy = clientY - joyCenter.y;
            const dist = Math.min(Math.hypot(dx, dy), maxRadius);
            const angle = Math.atan2(dy, dx);

            // Move o visual
            const moveX = Math.cos(angle) * dist;
            const moveY = Math.sin(angle) * dist;
            stick.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;

            // Atualiza vetor de input (normalizado 0-1)
            const force = dist / maxRadius;
            this.inputVector = {
                x: Math.cos(angle) * force,
                y: Math.sin(angle) * force
            };
        };

        zone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            joyActive = true;
            const rect = zone.getBoundingClientRect();
            joyCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        zone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if(joyActive) handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        const endJoystick = (e) => {
            e.preventDefault();
            joyActive = false;
            this.inputVector = { x: 0, y: 0 };
            stick.style.transform = `translate(-50%, -50%)`;
        };
        zone.addEventListener('touchend', endJoystick);
        zone.addEventListener('touchcancel', endJoystick);

        // Fallback Mouse (PC Testing)
        window.addEventListener('mousemove', (e) => {
            if(!this.isRunning || joyActive) return;
            const cx = window.innerWidth/2;
            const cy = window.innerHeight/2;
            const dx = e.clientX - cx;
            const dy = e.clientY - cy;
            const dist = Math.hypot(dx, dy);
            const max = Math.min(cx, cy);
            if(dist > 10) {
                this.inputVector = { x: dx/max, y: dy/max };
            } else {
                this.inputVector = { x: 0, y: 0 };
            }
        });
    }

    // --- ÁUDIO ---
    initAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            // Cria sons simples via oscilador (sem carregar arquivos para ser rápido)
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    playSound(type) {
        if (!this.audioContext) return;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        if (type === 'eat') {
            osc.frequency.setValueAtTime(400, this.audioContext.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
            osc.start(); osc.stop(this.audioContext.currentTime + 0.1);
        } else if (type === 'split') {
            osc.frequency.setValueAtTime(200, this.audioContext.currentTime);
            osc.frequency.linearRampToValueAtTime(100, this.audioContext.currentTime + 0.1);
            gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
            osc.start(); osc.stop(this.audioContext.currentTime + 0.1);
        }
    }

    toggleRadio() {
        const container = document.getElementById('youtube-container');
        const btn = document.getElementById('btnRadioToggle');
        this.lofiPlaying = !this.lofiPlaying;
        
        if (this.lofiPlaying) {
            btn.innerText = "⏸️";
            // Lofi Girl Stream ID
            container.innerHTML = `<iframe width="1" height="1" src="https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1&enablejsapi=1" frameborder="0" allow="autoplay"></iframe>`;
        } else {
            btn.innerText = "▶️";
            container.innerHTML = "";
        }
    }

    // --- LÓGICA DO JOGO ---
    startGame() {
        this.initAudio(); // Desbloqueia áudio no mobile
        
        const nick = document.getElementById('nickInput').value || this.auth.userData.name || "Player";
        this.playerName = nick;

        // Reset
        this.myCells = [];
        this.foods = [];
        this.bots = [];
        
        // Spawns
        for(let i=0; i<this.FOOD_COUNT; i++) this.spawnFood();
        for(let i=0; i<this.BOT_COUNT; i++) this.spawnBot();

        // Player Spawn (Verifica Itens)
        let startMass = 30;
        let color = this.randColor();
        const items = this.auth.userData.items || [];
        
        if(items.includes('startMass')) startMass = 80;
        if(items.includes('neonSkin')) color = '#00ff00';

        this.myCells.push({
            x: Math.random() * this.MAP_SIZE,
            y: Math.random() * this.MAP_SIZE,
            r: startMass,
            c: color,
            vx: 0, vy: 0,
            id: Math.random()
        });

        // Troca Tela
        document.getElementById('mainMenu').style.display = 'none';
        document.getElementById('gameHUD').style.display = 'block';
        this.isRunning = true;
    }

    spawnFood() {
        this.foods.push({
            x: Math.random() * this.MAP_SIZE,
            y: Math.random() * this.MAP_SIZE,
            r: Math.random() * 3 + 4, // Comida tamanho
            c: this.randColor()
        });
    }

    spawnBot() {
        this.bots.push({
            x: Math.random() * this.MAP_SIZE,
            y: Math.random() * this.MAP_SIZE,
            r: Math.random() * 30 + 20,
            c: this.randColor(),
            target: { x: Math.random() * this.MAP_SIZE, y: Math.random() * this.MAP_SIZE },
            timer: 0,
            id: Math.random()
        });
    }

    randColor() {
        return `hsl(${Math.random() * 360}, 80%, 50%)`;
    }

    // --- PHYSICS LOOP ---
    loop() {
        if (this.isRunning) {
            this.update();
            this.updateBots();
        }
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        let totalMass = 0;

        // Física das Minhas Células
        this.myCells.forEach((cell, i) => {
            // Movimento: Mais pesado = mais lento
            let speed = 8 * Math.pow(cell.r, -0.4) * 5; 
            speed = Math.max(speed, 2);

            cell.x += this.inputVector.x * speed;
            cell.y += this.inputVector.y * speed;

            // Inércia (Split)
            if (cell.vx) { cell.x += cell.vx; cell.vx *= 0.9; if(Math.abs(cell.vx)<0.1) cell.vx=0; }
            if (cell.vy) { cell.y += cell.vy; cell.vy *= 0.9; if(Math.abs(cell.vy)<0.1) cell.vy=0; }

            // Limites do Mapa
            cell.x = Math.max(cell.r, Math.min(this.MAP_SIZE - cell.r, cell.x));
            cell.y = Math.max(cell.r, Math.min(this.MAP_SIZE - cell.r, cell.y));

            totalMass += Math.floor(cell.r);

            // Colisão Comida
            for (let f = this.foods.length - 1; f >= 0; f--) {
                const food = this.foods[f];
                if (Math.hypot(cell.x - food.x, cell.y - food.y) < cell.r) {
                    // Área cresce
                    const newArea = Math.PI * cell.r * cell.r + 50;
                    cell.r = Math.sqrt(newArea / Math.PI);
                    
                    this.foods.splice(f, 1);
                    this.spawnFood();
                    this.playSound('eat');
                    
                    if (Math.random() < 0.05) { // 5% chance moeda
                        this.auth.userData.coins++;
                        this.updateCoins(this.auth.userData.coins);
                        if(this.auth.user) this.auth.saveCoins(this.auth.userData.coins);
                    }
                }
            }

            // Colisão Bots
            for (let b = this.bots.length - 1; b >= 0; b--) {
                const bot = this.bots[b];
                const dist = Math.hypot(cell.x - bot.x, cell.y - bot.y);
                
                if (dist < cell.r && cell.r > bot.r * 1.1) {
                    // Comeu Bot
                    const gain = Math.PI * bot.r * bot.r;
                    cell.r = Math.sqrt((Math.PI * cell.r * cell.r + gain) / Math.PI);
                    this.bots.splice(b, 1);
                    this.spawnBot();
                    this.playSound('eat');
                } else if (dist < bot.r && bot.r > cell.r * 1.1) {
                    // Morreu
                    this.myCells.splice(i, 1);
                    this.checkGameOver();
                }
            }
        });

        // UI Updates
        document.getElementById('massVal').innerText = totalMass;

        // Câmera Follow
        if (this.myCells.length > 0) {
            let cx = 0, cy = 0;
            this.myCells.forEach(c => { cx += c.x; cy += c.y; });
            cx /= this.myCells.length;
            cy /= this.myCells.length;

            // Zoom automático baseado na massa + ajuste manual do slider
            const autoZoom = 1 / Math.pow(totalMass / 100, 0.4); 
            const finalZoom = Math.max(0.1, Math.min(2, autoZoom * this.cam.userZoom));
            
            this.cam.zoom += (finalZoom - this.cam.zoom) * 0.1; // Smooth
            this.cam.x = cx - (this.canvas.width / 2) / this.cam.zoom;
            this.cam.y = cy - (this.canvas.height / 2) / this.cam.zoom;
        }
    }

    updateBots() {
        this.bots.forEach(bot => {
            // IA Simples
            bot.timer++;
            if(bot.timer > 100 + Math.random()*100) {
                bot.target = { x: Math.random() * this.MAP_SIZE, y: Math.random() * this.MAP_SIZE };
                bot.timer = 0;
            }

            // Move
            let dx = bot.target.x - bot.x;
            let dy = bot.target.y - bot.y;
            let dist = Math.hypot(dx, dy);
            let speed = 10 * Math.pow(bot.r, -0.4);
            
            if(dist > 10) {
                bot.x += (dx/dist) * speed;
                bot.y += (dy/dist) * speed;
            }

            // Limites
            bot.x = Math.max(bot.r, Math.min(this.MAP_SIZE - bot.r, bot.x));
            bot.y = Math.max(bot.r, Math.min(this.MAP_SIZE - bot.r, bot.y));
        });
    }

    split() {
        if (this.myCells.length >= 16) return;
        this.playSound('split');
        let adds = [];
        this.myCells.forEach(cell => {
            if (cell.r < 30) return;
            cell.r /= 1.414;
            
            // Direção
            let angle = Math.atan2(this.inputVector.y, this.inputVector.x);
            if (this.inputVector.x === 0 && this.inputVector.y === 0) angle = 0;

            adds.push({
                x: cell.x + Math.cos(angle) * cell.r * 2,
                y: cell.y + Math.sin(angle) * cell.r * 2,
                r: cell.r,
                c: cell.c,
                vx: Math.cos(angle) * 40,
                vy: Math.sin(angle) * 40,
                id: Math.random()
            });
        });
        this.myCells = this.myCells.concat(adds);
    }

    eject() {
        // Ejetar massa (simplificado visualmente)
        this.myCells.forEach(c => {
            if(c.r > 20) {
                c.r -= 2;
                // Poderia criar uma particula de comida aqui
            }
        });
    }

    checkGameOver() {
        if (this.myCells.length === 0) {
            this.isRunning = false;
            alert("VOCÊ PERDEU!");
            document.getElementById('gameHUD').style.display = 'none';
            document.getElementById('mainMenu').style.display = 'flex';
        }
    }

    // --- RENDERIZAÇÃO ---
    draw() {
        // Fundo
        this.ctx.fillStyle = '#0b0b14';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.scale(this.cam.zoom, this.cam.zoom);
        this.ctx.translate(-this.cam.x, -this.cam.y);

        // Grid
        this.ctx.strokeStyle = '#1a1a2e';
        this.ctx.lineWidth = 5;
        this.ctx.strokeRect(0, 0, this.MAP_SIZE, this.MAP_SIZE);
        
        this.ctx.globalAlpha = 0.3;
        this.ctx.beginPath();
        for (let i = 0; i < this.MAP_SIZE; i += 200) {
            this.ctx.moveTo(i, 0); this.ctx.lineTo(i, this.MAP_SIZE);
            this.ctx.moveTo(0, i); this.ctx.lineTo(this.MAP_SIZE, i);
        }
        this.ctx.stroke();
        this.ctx.globalAlpha = 1;

        // Comida
        this.foods.forEach(f => {
            this.ctx.beginPath();
            this.ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            this.ctx.fillStyle = f.c;
            this.ctx.fill();
        });

        // Entidades (Bots + Players)
        const all = [...this.bots.map(b => ({...b, t:'bot'})), ...this.myCells.map(c => ({...c, t:'me', n:this.playerName}))];
        all.sort((a,b) => a.r - b.r);

        all.forEach(e => {
            this.ctx.beginPath();
            this.ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
            this.ctx.fillStyle = e.c;
            
            // Neon Effect
            if(e.c === '#00ff00') { this.ctx.shadowBlur = 20; this.ctx.shadowColor = '#00ff00'; }
            
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
            this.ctx.lineWidth = 2;
            this.ctx.strokeStyle = '#222';
            this.ctx.stroke();

            // Nome
            if (e.r > 10) {
                this.ctx.fillStyle = 'white';
                this.ctx.font = `bold ${Math.max(10, e.r / 2.5)}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(e.t==='bot'?'Bot':e.n, e.x, e.y);
            }
        });

        this.ctx.restore();
    }

    // --- LOJA ---
    buyItem(item, cost) {
        if(this.auth.userData.coins >= cost) {
            if(this.auth.userData.items.includes(item)) { alert("Já possui!"); return; }
            this.auth.userData.coins -= cost;
            this.auth.saveCoins(this.auth.userData.coins);
            this.auth.saveItem(item);
            this.updateCoins(this.auth.userData.coins);
            alert("Comprado!");
        } else {
            alert("Dinheiro insuficiente!");
        }
    }

    updateCoins(qtd) {
        document.getElementById('coinDisplay').innerText = qtd;
        document.getElementById('shopCoins').innerText = qtd;
    }
}
