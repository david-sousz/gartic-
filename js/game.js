import { db } from './firebase-config.js';
import { doc, setDoc, onSnapshot, collection, serverTimestamp, query } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Configurações
        this.MAP_SIZE = 4000;
        this.BOT_COUNT = 25; // Quantidade de bots
        
        // Entidades
        this.myCells = [];
        this.foods = [];
        this.bots = []; // Array para bots
        this.otherPlayers = {};
        
        // Câmera e Estado
        this.cam = { x: 0, y: 0, zoom: 1, targetZoom: 1 };
        this.gameRunning = false;
        
        // Inputs
        this.joystickVector = { x: 0, y: 0 };
        
        this.bindEvents();
        // Inicia o loop visual, mas o jogo só roda lógica quando gameRunning = true
        this.loop(); 
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    bindEvents() {
        // Botão Jogar
        document.getElementById('btnPlay').onclick = () => {
            // Tenta desbloquear áudio ao clicar em jogar
            if(window.audioManager) window.audioManager.unlockAudio();
            this.start();
        };

        // Mouse Move (PC)
        window.addEventListener('mousemove', e => {
            if(!this.gameRunning) return;
            const cx = window.innerWidth/2;
            const cy = window.innerHeight/2;
            // Vetor normalizado
            const dx = e.clientX - cx;
            const dy = e.clientY - cy;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const maxDist = Math.min(cx, cy);
            
            // Joystick virtual baseado na distância do mouse ao centro
            const force = Math.min(dist / 100, 1); 
            this.joystickVector.x = (dx / dist) * force;
            this.joystickVector.y = (dy / dist) * force;
            
            // Evita NaN se o mouse estiver exatamente no centro
            if(dist < 1) this.joystickVector = {x:0, y:0};
        });

        // Inputs Teclado
        window.addEventListener('keydown', e => {
            if(e.code === 'Space') this.split();
        });
        
        // Zoom
        window.addEventListener('wheel', e => {
            const dir = e.deltaY > 0 ? 0.9 : 1.1;
            this.cam.targetZoom = Math.max(0.1, Math.min(1.5, this.cam.targetZoom * dir));
        });
    }

    start() {
        const nickname = document.getElementById('nicknameInput').value || "Player";
        this.myName = nickname;
        
        // Reset
        this.myCells = [];
        this.foods = [];
        this.bots = [];
        
        // Spawns Iniciais
        for(let i=0; i<500; i++) this.spawnFood();
        for(let i=0; i<this.BOT_COUNT; i++) this.spawnBot();
        
        // Verifica itens comprados (com safe check)
        let initialMass = 30;
        let color = this.getRandomColor();
        
        if (window.authManager && window.authManager.userData) {
            if(window.authManager.userData.items.includes('startMass')) initialMass = 80;
            if(window.authManager.userData.items.includes('neonSkin')) color = '#00ff00';
        }

        this.myCells.push({
            x: Math.random() * this.MAP_SIZE,
            y: Math.random() * this.MAP_SIZE,
            r: initialMass,
            c: color,
            vx: 0, vy: 0,
            id: Math.random()
        });

        // UI
        document.getElementById('uiLayer').querySelector('#mainMenu').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        
        this.gameRunning = true;
        this.startNetworkSync();
    }

    spawnFood() {
        this.foods.push({
            x: Math.random() * this.MAP_SIZE,
            y: Math.random() * this.MAP_SIZE,
            r: Math.random() * 3 + 2,
            c: this.getRandomColor()
        });
    }

    spawnBot() {
        this.bots.push({
            x: Math.random() * this.MAP_SIZE,
            y: Math.random() * this.MAP_SIZE,
            r: Math.random() * 20 + 20, // Tamanho variado
            c: this.getRandomColor(),
            target: {x: Math.random()*this.MAP_SIZE, y: Math.random()*this.MAP_SIZE},
            id: Math.random()
        });
    }

    getRandomColor() {
        return `hsl(${Math.random() * 360}, 100%, 50%)`;
    }

    // --- GAME LOOP ---
    loop() {
        if(this.gameRunning) {
            this.update();
            this.updateBots(); // IA dos Bots
        }
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        let totalMass = 0;
        
        // Câmera Zoom Suave
        this.cam.zoom += (this.cam.targetZoom - this.cam.zoom) * 0.1;

        // Física das Minhas Células
        this.myCells.forEach((cell, i) => {
            // Velocidade baseada na massa (Quanto maior, mais lento)
            let speed = 15 * Math.pow(cell.r, -0.4); 
            speed = Math.max(speed, 2); // Mínimo de velocidade

            // Aplica Joystick
            cell.x += this.joystickVector.x * speed;
            cell.y += this.joystickVector.y * speed;
            
            // Aplica Inércia (Split/Eject)
            if(Math.abs(cell.vx) > 0.1) { cell.x += cell.vx; cell.vx *= 0.9; }
            if(Math.abs(cell.vy) > 0.1) { cell.y += cell.vy; cell.vy *= 0.9; }

            // Limites do Mapa
            cell.x = Math.max(cell.r, Math.min(this.MAP_SIZE-cell.r, cell.x));
            cell.y = Math.max(cell.r, Math.min(this.MAP_SIZE-cell.r, cell.y));
            
            totalMass += Math.floor(cell.r);

            // Comer Comida
            for (let f = this.foods.length - 1; f >= 0; f--) {
                const food = this.foods[f];
                if (Math.hypot(cell.x - food.x, cell.y - food.y) < cell.r) {
                    cell.r = Math.sqrt((Math.PI * cell.r * cell.r + 100) / Math.PI); // Cresce
                    this.foods.splice(f, 1);
                    this.spawnFood();
                    // Som (com limitação para não estourar o áudio)
                    if(Math.random() > 0.5 && window.audioManager) window.audioManager.play('eat');
                }
            }

            // Comer Bots
            for (let b = this.bots.length - 1; b >= 0; b--) {
                const bot = this.bots[b];
                const dist = Math.hypot(cell.x - bot.x, cell.y - bot.y);
                
                // Regra: precisa ser 10% maior para comer
                if (dist < cell.r && cell.r > bot.r * 1.1) {
                    // Comeu Bot
                    let areaGain = Math.PI * bot.r * bot.r;
                    cell.r = Math.sqrt((Math.PI * cell.r * cell.r + areaGain) / Math.PI);
                    this.bots.splice(b, 1);
                    this.spawnBot();
                    if(window.audioManager) window.audioManager.play('explode');
                } else if (dist < bot.r && bot.r > cell.r * 1.1) {
                    // Morreu para Bot
                    this.myCells.splice(i, 1);
                    if(window.audioManager) window.audioManager.play('explode');
                    this.checkGameOver();
                }
            }
        });

        // Atualiza HUD de massa
        const massEl = document.getElementById('massDisplay');
        if(massEl) massEl.innerText = totalMass;

        // Atualiza Câmera
        if (this.myCells.length > 0) {
            let cx = 0, cy = 0;
            this.myCells.forEach(c => { cx += c.x; cy += c.y; });
            cx /= this.myCells.length;
            cy /= this.myCells.length;
            
            this.cam.x = cx - (this.canvas.width / 2) / this.cam.zoom;
            this.cam.y = cy - (this.canvas.height / 2) / this.cam.zoom;
        }
    }

    updateBots() {
        this.bots.forEach(bot => {
            // IA Simples: Se tem alguem maior perto, foge. Se menor, persegue. Se não, anda aleatorio.
            let targetX = bot.target.x;
            let targetY = bot.target.y;
            let speed = 10 * Math.pow(bot.r, -0.4);

            // Verifica proximidade com jogador
            this.myCells.forEach(player => {
                let d = Math.hypot(bot.x - player.x, bot.y - player.y);
                if(d < 400) { // Campo de visão do bot
                    if(player.r > bot.r * 1.1) {
                        // FOGE: Inverte o vetor de direção
                        let angle = Math.atan2(bot.y - player.y, bot.x - player.x);
                        targetX = bot.x + Math.cos(angle) * 500;
                        targetY = bot.y + Math.sin(angle) * 500;
                    } else if (bot.r > player.r * 1.1) {
                        // ATACA
                        targetX = player.x;
                        targetY = player.y;
                    }
                }
            });

            // Move Bot
            let dx = targetX - bot.x;
            let dy = targetY - bot.y;
            let dist = Math.hypot(dx, dy);
            
            if(dist > 10) {
                bot.x += (dx/dist) * speed;
                bot.y += (dy/dist) * speed;
            } else {
                // Chegou no destino aleatorio, escolhe outro
                bot.target = {x: Math.random()*this.MAP_SIZE, y: Math.random()*this.MAP_SIZE};
            }

            // Limites
            bot.x = Math.max(bot.r, Math.min(this.MAP_SIZE-bot.r, bot.x));
            bot.y = Math.max(bot.r, Math.min(this.MAP_SIZE-bot.r, bot.y));
        });
    }

    checkGameOver() {
        if (this.myCells.length === 0) {
            this.gameRunning = false;
            alert("Game Over!");
            document.getElementById('hud').style.display = 'none';
            document.getElementById('uiLayer').querySelector('#mainMenu').style.display = 'flex';
        }
    }

    split() {
        if(this.myCells.length >= 16) return;
        if(window.audioManager) window.audioManager.play('split');
        
        let newCells = [];
        this.myCells.forEach(cell => {
            if(cell.r < 30) return; // Mínimo para split
            
            let newR = cell.r / 1.414;
            cell.r = newR;
            
            // Direção do split
            let angle = Math.atan2(this.joystickVector.y, this.joystickVector.x);
            if(this.joystickVector.x === 0 && this.joystickVector.y === 0) angle = 0;

            newCells.push({
                x: cell.x + Math.cos(angle)*cell.r*2,
                y: cell.y + Math.sin(angle)*cell.r*2,
                r: newR,
                c: cell.c,
                vx: Math.cos(angle) * 30, // Força do pulo
                vy: Math.sin(angle) * 30,
                id: Math.random()
            });
        });
        this.myCells = this.myCells.concat(newCells);
    }

    draw() {
        // Fundo
        this.ctx.fillStyle = '#050510';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.scale(this.cam.zoom, this.cam.zoom);
        this.ctx.translate(-this.cam.x, -this.cam.y);

        // Grid
        this.ctx.strokeStyle = '#1a1a2e';
        this.ctx.lineWidth = 5;
        this.ctx.strokeRect(0,0, this.MAP_SIZE, this.MAP_SIZE); // Borda do mapa
        this.ctx.lineWidth = 1;
        this.ctx.globalAlpha = 0.5;
        this.ctx.beginPath();
        for(let x=0; x<this.MAP_SIZE; x+=200) { this.ctx.moveTo(x,0); this.ctx.lineTo(x,this.MAP_SIZE); }
        for(let y=0; y<this.MAP_SIZE; y+=200) { this.ctx.moveTo(0,y); this.ctx.lineTo(this.MAP_SIZE,y); }
        this.ctx.stroke();
        this.ctx.globalAlpha = 1;

        // Desenha Comida
        this.foods.forEach(f => {
            this.ctx.beginPath();
            this.ctx.arc(f.x, f.y, f.r, 0, Math.PI*2);
            this.ctx.fillStyle = f.c;
            this.ctx.fill();
        });

        // Desenha Bots e Players (Ordenados por tamanho para Z-index correto)
        let allEntities = [
            ...this.bots.map(b => ({...b, type: 'bot'})),
            ...this.myCells.map(c => ({...c, type: 'me', name: this.myName})),
            // Adicionar outros players online aqui se houver
        ];
        allEntities.sort((a,b) => a.r - b.r);

        allEntities.forEach(e => {
            this.ctx.beginPath();
            this.ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
            this.ctx.fillStyle = e.c;
            // Borda do player
            this.ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
            this.ctx.fill();

            // Nome
            if(e.r > 15) {
                this.ctx.fillStyle = 'white';
                this.ctx.font = `bold ${e.r/2.5}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(e.type === 'bot' ? 'Bot' : e.name, e.x, e.y);
            }
        });

        this.ctx.restore();
    }

    startNetworkSync() {
        if(window.authManager && window.authManager.user) {
            // Lógica simples de envio para Firestore
            // (Para evitar travar se não tiver autenticado, checamos antes)
             setInterval(() => {
                if(!this.gameRunning) return;
                const simpleCells = this.myCells.map(c => ({
                    x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.r), c: c.c
                }));
                // Salva no Firestore (Exige regras de segurança abertas ou login)
                try {
                    setDoc(doc(db, "players", window.authManager.user.uid), {
                        n: this.myName,
                        cells: simpleCells,
                        t: serverTimestamp()
                    }, {merge:true});
                } catch(e) { console.log("Erro sync", e); }
            }, 200);
        }
    }
}
