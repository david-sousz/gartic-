import { AuthSystem } from './firebase-config.js';

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // --- CONFIGURAÇÕES ---
        this.MAP_SIZE = 3000; // Mapa um pouco menor para mais encontros
        this.BOT_COUNT = 30;
        this.FOOD_COUNT = 600;
        this.VIRUS_COUNT = 25;
        this.MERGE_DELAY = 12000; // 12s para juntar

        this.myCells = [];
        this.foods = [];
        this.bots = [];
        this.viruses = [];
        this.ejectedMass = [];

        this.inputVector = { x: 0, y: 0 };
        this.cam = { x: 0, y: 0, zoom: 1, userZoom: 1 };
        
        this.auth = new AuthSystem(this);
        
        // SISTEMA DE ÁUDIO NATIVO (Oscillators)
        this.audioCtx = null;
        this.radioPlayer = null;
        this.isRadioPlaying = false;

        this.resize();
        this.initEvents();
        this.loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    initEvents() {
        window.addEventListener('resize', () => this.resize());
        
        // Configuração do YouTube API
        window.onYouTubeIframeAPIReady = () => {
            this.radioPlayer = new YT.Player('player', {
                height: '1', width: '1',
                videoId: 'jfKfPfyJRdk', // Lofi Girl ID
                playerVars: { 'autoplay': 0, 'controls': 0, 'playsinline': 1 }
            });
        };

        const bind = (id, action) => {
            const el = document.getElementById(id);
            if(el) el.onclick = action;
        };

        bind('btnPlay', () => this.startGame());
        bind('btnShop', () => document.getElementById('shopModal').style.display = 'flex');
        
        bind('btnRadioToggle', () => {
            if(!this.radioPlayer || !this.radioPlayer.playVideo) return;
            const btn = document.getElementById('btnRadioToggle');
            if(this.isRadioPlaying) {
                this.radioPlayer.pauseVideo();
                btn.innerText = "PLAY ▶";
                btn.classList.remove('active');
            } else {
                this.radioPlayer.playVideo();
                btn.innerText = "PAUSE ⏸";
                btn.classList.add('active');
            }
            this.isRadioPlaying = !this.isRadioPlaying;
        });

        const slider = document.getElementById('zoomSlider');
        if(slider) slider.oninput = (e) => this.cam.userZoom = e.target.value / 100;

        // Binds In-Game
        const btnSplit = document.getElementById('btnSplit');
        const btnEject = document.getElementById('btnEject');
        if(btnSplit) {
            btnSplit.addEventListener('touchstart', (e)=>{e.preventDefault(); this.split()}, {passive:false});
            btnSplit.onclick = () => this.split();
        }
        if(btnEject) {
            btnEject.addEventListener('touchstart', (e)=>{e.preventDefault(); this.eject()}, {passive:false});
            btnEject.onclick = () => this.eject();
        }

        // Joystick
        const zone = document.getElementById('joystickZone');
        const stick = document.getElementById('joystickStick');
        let joyActive = false, joyCenter = {x:0, y:0}, maxRadius = 40;

        const moveJoy = (cx, cy) => {
            const dx = cx - joyCenter.x, dy = cy - joyCenter.y;
            const dist = Math.min(Math.hypot(dx, dy), maxRadius);
            const ang = Math.atan2(dy, dx);
            stick.style.transform = `translate(calc(-50% + ${Math.cos(ang)*dist}px), calc(-50% + ${Math.sin(ang)*dist}px))`;
            this.inputVector = { x: Math.cos(ang)*(dist/maxRadius), y: Math.sin(ang)*(dist/maxRadius) };
        };

        if(zone) {
            zone.addEventListener('touchstart', e => {
                e.preventDefault(); joyActive=true;
                const r = zone.getBoundingClientRect();
                joyCenter = { x: r.left+r.width/2, y: r.top+r.height/2 };
                moveJoy(e.touches[0].clientX, e.touches[0].clientY);
            }, {passive:false});
            zone.addEventListener('touchmove', e => {
                e.preventDefault(); if(joyActive) moveJoy(e.touches[0].clientX, e.touches[0].clientY);
            }, {passive:false});
            const end = e => { e.preventDefault(); joyActive=false; this.inputVector={x:0,y:0}; stick.style.transform=`translate(-50%,-50%)`; };
            zone.addEventListener('touchend', end);
        }
    }

    startGame() {
        this.initAudio(); // Ativa contexto de áudio
        const nickInput = document.getElementById('nickInput');
        
        // Resolução de Nome
        let name = nickInput.value.trim();
        if(!name && this.auth.userData.name && this.auth.userData.name !== "undefined") {
            name = this.auth.userData.name;
        }
        this.playerName = name || "Player";

        // Reset
        this.myCells = []; this.foods = []; this.bots = []; this.viruses = []; this.ejectedMass = [];
        
        for(let i=0; i<this.FOOD_COUNT; i++) this.spawnFood();
        for(let i=0; i<this.BOT_COUNT; i++) this.spawnBot();
        for(let i=0; i<this.VIRUS_COUNT; i++) this.spawnVirus();

        // Bonus Itens
        let mass = 30, color = this.randColor();
        if(this.auth.userData.items.includes('startMass')) mass = 80;
        if(this.auth.userData.items.includes('neonSkin')) color = '#00ff00';

        this.myCells.push({ 
            x: Math.random()*this.MAP_SIZE, y: Math.random()*this.MAP_SIZE, 
            r: mass, c: color, vx:0, vy:0, birth: Date.now(), id: Math.random() 
        });

        document.getElementById('mainMenu').style.display = 'none';
        document.getElementById('gameHUD').style.display = 'block';
        this.auth.updateGameHUD();
        this.isRunning = true;
    }

    loop() {
        if(this.isRunning) {
            this.update();
            this.updateBots();
        }
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        const now = Date.now();
        let totalMass = 0;

        for(let i=0; i<this.myCells.length; i++) {
            let cell = this.myCells[i];
            
            // --- FÍSICA AJUSTADA (Mais lenta) ---
            // Base speed (4) * Decay. Resulta em ~3.5 no começo e cai para ~1.5
            let speed = 4 * Math.pow(cell.r, -0.35) * 6; 
            
            cell.vx += this.inputVector.x * speed * 0.15;
            cell.vy += this.inputVector.y * speed * 0.15;
            cell.vx *= 0.92; cell.vy *= 0.92; // Atrito
            cell.x += cell.vx; cell.y += cell.vy;

            cell.x = Math.max(cell.r, Math.min(this.MAP_SIZE-cell.r, cell.x));
            cell.y = Math.max(cell.r, Math.min(this.MAP_SIZE-cell.r, cell.y));

            totalMass += Math.floor(cell.r);

            // --- REAGRUPAMENTO (MERGE) ---
            for(let j=i+1; j<this.myCells.length; j++) {
                let other = this.myCells[j];
                let d = Math.hypot(cell.x-other.x, cell.y-other.y);
                let canMerge = (now > cell.birth + this.MERGE_DELAY) && (now > other.birth + this.MERGE_DELAY);
                
                if(canMerge) {
                    // ATRAÇÃO FORTE
                    let lerp = 0.08; 
                    cell.x += (other.x - cell.x) * lerp;
                    cell.y += (other.y - cell.y) * lerp;
                    other.x -= (other.x - cell.x) * lerp;
                    other.y -= (other.y - cell.y) * lerp;

                    if(d < (cell.r + other.r) * 0.6) { // Funde
                        let area = Math.PI*cell.r*cell.r + Math.PI*other.r*other.r;
                        cell.r = Math.sqrt(area/Math.PI);
                        this.myCells.splice(j, 1); j--;
                    }
                } else { 
                    // COLISÃO SÓLIDA
                    if (d < cell.r + other.r) {
                        let overlap = (cell.r + other.r) - d;
                        let ang = Math.atan2(cell.y-other.y, cell.x-other.x);
                        let force = overlap * 0.5; // Empurra rápido
                        cell.x += Math.cos(ang) * force;
                        cell.y += Math.sin(ang) * force;
                        other.x -= Math.cos(ang) * force;
                        other.y -= Math.sin(ang) * force;
                    }
                }
            }

            this.checkCollisions(cell, i, true);
        }
        
        document.getElementById('massVal').innerText = totalMass;
        
        // Câmera Suave
        if(this.myCells.length > 0) {
            let cx=0, cy=0;
            this.myCells.forEach(c => { cx+=c.x; cy+=c.y });
            cx /= this.myCells.length; cy /= this.myCells.length;
            
            let safeMass = totalMass || 100;
            // Zoom base mais afastado para ver mais
            let targetZoom = (1 / Math.pow(safeMass, 0.44)) * 7 * this.cam.userZoom;
            targetZoom = Math.max(0.05, Math.min(1.5, targetZoom));
            
            if(!isNaN(targetZoom)) this.cam.zoom += (targetZoom - this.cam.zoom) * 0.08;
            this.cam.x = cx - (this.canvas.width/2)/this.cam.zoom;
            this.cam.y = cy - (this.canvas.height/2)/this.cam.zoom;
        }
    }

    updateBots() {
        this.bots.forEach((bot, bIdx) => {
            if(Math.random() < 0.05) { // Muda direção as vezes
                let ang = Math.random() * Math.PI * 2;
                bot.tx = Math.cos(ang); bot.ty = Math.sin(ang);
            }
            if(!bot.tx) { bot.tx=0; bot.ty=0; }

            // Foge de player grande
            this.myCells.forEach(c => {
                let d = Math.hypot(c.x-bot.x, c.y-bot.y);
                if(d < 300 && c.r > bot.r*1.1) {
                    let ang = Math.atan2(bot.y-c.y, bot.x-c.x);
                    bot.tx = Math.cos(ang); bot.ty = Math.sin(ang);
                }
            });

            let speed = 2 * Math.pow(bot.r, -0.3) * 6; // Bots também lentos
            bot.x += bot.tx * speed;
            bot.y += bot.ty * speed;
            
            bot.x = Math.max(bot.r, Math.min(this.MAP_SIZE-bot.r, bot.x));
            bot.y = Math.max(bot.r, Math.min(this.MAP_SIZE-bot.r, bot.y));
            
            this.checkBotCollisions(bot, bIdx);
        });
    }

    checkCollisions(cell, idx, isPlayer) {
        // Comida
        for(let i=this.foods.length-1; i>=0; i--) {
            if(Math.hypot(cell.x-this.foods[i].x, cell.y-this.foods[i].y) < cell.r) {
                cell.r = Math.sqrt((Math.PI*cell.r*cell.r + 30)/Math.PI);
                this.foods.splice(i, 1);
                this.spawnFood();
                if(isPlayer && Math.random() < 0.2) this.playTone('pop');
                if(isPlayer) this.auth.gainXp(1);
            }
        }
        // Vírus
        for(let i=this.viruses.length-1; i>=0; i--) {
            if(Math.hypot(cell.x-this.viruses[i].x, cell.y-this.viruses[i].y) < cell.r*0.9) {
                if(cell.r > this.viruses[i].r * 1.1) {
                    this.explodeCell(idx, i, isPlayer); 
                    if(isPlayer) this.auth.gainXp(50);
                }
            }
        }
    }

    checkBotCollisions(bot, bIdx) {
        for(let i=this.foods.length-1; i>=0; i--) {
            if(Math.hypot(bot.x-this.foods[i].x, bot.y-this.foods[i].y) < bot.r) {
                bot.r = Math.sqrt((Math.PI*bot.r*bot.r + 30)/Math.PI);
                this.foods.splice(i, 1);
                this.spawnFood();
            }
        }
        this.myCells.forEach((player, pIdx) => {
            let d = Math.hypot(bot.x - player.x, bot.y - player.y);
            if(d < Math.max(bot.r, player.r)) {
                if(player.r > bot.r * 1.1) {
                    let gain = Math.PI*bot.r*bot.r;
                    player.r = Math.sqrt((Math.PI*player.r*player.r + gain)/Math.PI);
                    this.bots.splice(bIdx, 1);
                    this.spawnBot();
                    this.auth.gainXp(100);
                    this.playTone('eat');
                } else if (bot.r > player.r * 1.1) {
                    this.myCells.splice(pIdx, 1);
                    if(this.myCells.length === 0) this.gameOver();
                }
            }
        });
    }

    explodeCell(cellIdx, virusIdx, isPlayer) {
        let list = isPlayer ? this.myCells : this.bots;
        let cell = list[cellIdx];
        if (!cell) return;

        this.viruses.splice(virusIdx, 1);
        this.spawnVirus();
        if(isPlayer) this.playTone('explode');

        if(list.length >= 16) return;

        let pieces = Math.min(8, 16 - list.length);
        let area = Math.PI*cell.r*cell.r;
        cell.r = Math.sqrt((area / (pieces+1)) / Math.PI);

        for(let k=0; k<pieces; k++) {
            let ang = (Math.PI*2/pieces)*k;
            list.push({
                x: cell.x, y: cell.y, r: cell.r, c: cell.c,
                vx: Math.cos(ang)*20, vy: Math.sin(ang)*20,
                birth: Date.now(), id: Math.random()
            });
        }
    }

    draw() {
        this.ctx.fillStyle = '#0a0a12'; this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        this.ctx.save();
        if(!isNaN(this.cam.zoom)) {
            this.ctx.scale(this.cam.zoom, this.cam.zoom);
            this.ctx.translate(-this.cam.x, -this.cam.y);
        }
        
        // Grid
        this.ctx.strokeStyle = '#1e1e2e'; this.ctx.lineWidth = 1; this.ctx.beginPath();
        for(let i=0; i<this.MAP_SIZE; i+=100) { this.ctx.moveTo(i,0); this.ctx.lineTo(i,this.MAP_SIZE); this.ctx.moveTo(0,i); this.ctx.lineTo(this.MAP_SIZE,i); }
        this.ctx.stroke();

        const drawCircle = (e, isSpiky) => {
            this.ctx.beginPath(); 
            if(isSpiky) {
                for(let i=0; i<24; i++) {
                    let a = (Math.PI*2/24)*i; let r = i%2==0 ? e.r : e.r-6;
                    this.ctx.lineTo(e.x+Math.cos(a)*r, e.y+Math.sin(a)*r);
                }
                this.ctx.closePath();
            } else { this.ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); }
            this.ctx.fillStyle=e.c || '#33ff33'; this.ctx.fill(); 
            if(e.c) { 
                this.ctx.shadowBlur=e.r/5; this.ctx.shadowColor=e.c; 
                this.ctx.lineWidth=2; this.ctx.strokeStyle='rgba(0,0,0,0.3)'; this.ctx.stroke(); 
                this.ctx.shadowBlur=0; 
            }
        };

        this.foods.forEach(f => drawCircle(f));
        this.viruses.forEach(v => drawCircle(v, true));
        
        let all = [...this.bots.map(b=>({...b, t:'bot', lvl: Math.floor(b.r/10)})), 
                   ...this.myCells.map(c=>({...c, t:'me', n:this.playerName, lvl: this.auth.userData.level || 1}))];
        all.sort((a,b)=>a.r-b.r);
        
        all.forEach(e => {
            drawCircle(e);
            if(e.r > 15) {
                this.ctx.fillStyle='white'; 
                this.ctx.textAlign='center'; this.ctx.textBaseline='middle';
                
                // NOME
                let fontSize = Math.max(10, e.r/2.5);
                this.ctx.font=`bold ${fontSize}px Poppins, Arial`;
                this.ctx.fillText(e.t==='bot'?'Bot':e.n, e.x, e.y - (e.r/5));
                
                // ESTRELA E NIVEL (CORRIGIDO)
                let starSize = fontSize * 0.7;
                this.ctx.font=`${starSize}px Arial`;
                this.ctx.fillStyle='#ffd700'; // Dourado
                this.ctx.fillText(`⭐ ${e.lvl}`, e.x, e.y + (e.r/2.5));
            }
        });
        this.ctx.restore();
    }

    // --- SINTETIZADOR DE ÁUDIO (SFX) ---
    initAudio() {
        if(!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if(this.audioCtx.state === 'suspended') this.audioCtx.resume();
    }

    playTone(type) {
        if(!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        const now = this.audioCtx.currentTime;
        
        if (type === 'pop') { // Comer comida
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.05);
            osc.start(now); osc.stop(now + 0.05);
        } else if (type === 'split') { // Dividir
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(200, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'eat') { // Comer jogador
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(400, now + 0.1);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'explode') { // Virus
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(10, now + 0.3);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        }
    }
    
    // --- UTILS ---
    spawnFood() { this.foods.push({x:this.rnd(this.MAP_SIZE), y:this.rnd(this.MAP_SIZE), r:Math.random()*3+5, c:this.randColor()}); }
    spawnVirus() { this.viruses.push({x:this.rnd(this.MAP_SIZE), y:this.rnd(this.MAP_SIZE), r:70}); }
    spawnBot() { this.bots.push({x:this.rnd(this.MAP_SIZE), y:this.rnd(this.MAP_SIZE), r:Math.random()*30+20, c:this.randColor()}); }
    rnd(m) { return Math.random()*m; }
    randColor() { return `hsl(${Math.random()*360}, 90%, 60%)`; }
    
    split() {
        if(this.myCells.length>=16) return;
        this.playTone('split');
        let adds=[];
        this.myCells.forEach(c=>{
            if(c.r<35) return;
            c.r /= 1.414;
            let ang = (this.inputVector.x==0&&this.inputVector.y==0)?0:Math.atan2(this.inputVector.y, this.inputVector.x);
            adds.push({x:c.x+Math.cos(ang)*c.r, y:c.y+Math.sin(ang)*c.r, r:c.r, c:c.c, vx:Math.cos(ang)*40, vy:Math.sin(ang)*40, birth:Date.now(), id:Math.random()});
        });
        this.myCells = this.myCells.concat(adds);
    }
    eject() {
        this.myCells.forEach(c=>{ if(c.r>35) c.r = Math.sqrt((Math.PI*c.r*c.r - 100)/Math.PI); });
        this.playTone('pop');
    }
    
    gameOver() {
        this.isRunning = false;
        alert("Fim de Jogo!");
        document.getElementById('gameHUD').style.display = 'none';
        document.getElementById('mainMenu').style.display = 'flex';
        this.auth.saveData();
    }
    buyItem() { alert("Use o menu!"); }
}
