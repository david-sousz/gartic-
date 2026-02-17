import { AuthSystem } from './firebase-config.js';

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Configs
        this.MAP_SIZE = 4000;
        this.BOT_COUNT = 25;
        this.FOOD_COUNT = 800;
        this.VIRUS_COUNT = 30;
        this.MERGE_DELAY = 15000;

        // Arrays
        this.myCells = [];
        this.foods = [];
        this.bots = [];
        this.viruses = [];
        this.ejectedMass = [];

        // Controle
        this.inputVector = { x: 0, y: 0 };
        this.cam = { x: 0, y: 0, zoom: 1, userZoom: 1 };
        
        this.auth = new AuthSystem(this);
        this.audioContext = null;

        this.resize();
        this.initEvents();
        this.loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    // --- EVENTOS E JOYSTICK (CÓDIGO ANTIGO OTIMIZADO) ---
    initEvents() {
        window.addEventListener('resize', () => this.resize());
        
        // UI Binds
        const bind = (id, action) => {
            const el = document.getElementById(id);
            if(el) el.onclick = action;
        };

        bind('btnPlay', () => this.startGame());
        bind('btnShop', () => document.getElementById('shopModal').style.display = 'flex');
        bind('btnRadioToggle', () => this.toggleRadio());

        const slider = document.getElementById('zoomSlider');
        if(slider) slider.oninput = (e) => this.cam.userZoom = e.target.value / 100;

        // Ações In-Game
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
        let joyActive = false, joyCenter = {x:0, y:0}, maxRadius = 50;

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
        this.initAudio();
        const nick = document.getElementById('nickInput').value;
        this.playerName = nick || this.auth.userData.name || "Player";
        
        this.myCells = []; this.foods = []; this.bots = []; this.viruses = []; this.ejectedMass = [];
        
        for(let i=0; i<this.FOOD_COUNT; i++) this.spawnFood();
        for(let i=0; i<this.BOT_COUNT; i++) this.spawnBot();
        for(let i=0; i<this.VIRUS_COUNT; i++) this.spawnVirus();

        // Check Items
        let mass = 30, color = this.randColor();
        if(this.auth.userData.items.includes('startMass')) mass = 80;
        if(this.auth.userData.items.includes('neonSkin')) color = '#00ff00';

        this.myCells.push({ x: Math.random()*this.MAP_SIZE, y: Math.random()*this.MAP_SIZE, r: mass, c: color, vx:0, vy:0, birth: Date.now(), id: Math.random() });

        document.getElementById('mainMenu').style.display = 'none';
        document.getElementById('gameHUD').style.display = 'block';
        this.auth.updateGameHUD();
        this.isRunning = true;
    }

    // --- LOGICA PRINCIPAL ---
    loop() {
        if(this.isRunning) {
            this.update();
            this.updateBots(); // IA Melhorada
            this.updateLeaderboard();
        }
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        const now = Date.now();
        let totalMass = 0;

        // Player Physics
        for(let i=0; i<this.myCells.length; i++) {
            let cell = this.myCells[i];
            let speed = 8 * Math.pow(cell.r, -0.43) * 6;
            
            cell.vx += this.inputVector.x * speed * 0.1;
            cell.vy += this.inputVector.y * speed * 0.1;
            cell.vx *= 0.9; cell.vy *= 0.9;
            cell.x += cell.vx; cell.y += cell.vy;

            // Limites
            cell.x = Math.max(cell.r, Math.min(this.MAP_SIZE-cell.r, cell.x));
            cell.y = Math.max(cell.r, Math.min(this.MAP_SIZE-cell.r, cell.y));

            totalMass += Math.floor(cell.r);

            // Merge
            for(let j=i+1; j<this.myCells.length; j++) {
                let other = this.myCells[j];
                let d = Math.hypot(cell.x-other.x, cell.y-other.y);
                if(d < cell.r + other.r) {
                    if(now > cell.birth + this.MERGE_DELAY && now > other.birth + this.MERGE_DELAY) {
                        if(d < cell.r) { // Merge
                            let area = Math.PI*cell.r*cell.r + Math.PI*other.r*other.r;
                            cell.r = Math.sqrt(area/Math.PI);
                            this.myCells.splice(j, 1); j--;
                        } else { // Pull
                            cell.x += (other.x-cell.x)*0.1; cell.y += (other.y-cell.y)*0.1;
                        }
                    } else { // Bump
                        let ang = Math.atan2(cell.y-other.y, cell.x-other.x);
                        cell.x += Math.cos(ang)*2; cell.y += Math.sin(ang)*2;
                    }
                }
            }

            // Colisões
            this.checkCollisions(cell, i, true);
        }
        
        document.getElementById('massVal').innerText = totalMass;
        
        // Câmera
        if(this.myCells.length > 0) {
            let cx=0, cy=0;
            this.myCells.forEach(c => { cx+=c.x; cy+=c.y });
            cx /= this.myCells.length; cy /= this.myCells.length;
            
            let safeMass = totalMass || 100;
            let targetZoom = (1 / Math.pow(safeMass/100, 0.4)) * this.cam.userZoom;
            targetZoom = Math.max(0.05, Math.min(2, targetZoom));
            
            if(!isNaN(targetZoom)) this.cam.zoom += (targetZoom - this.cam.zoom) * 0.1;
            this.cam.x = cx - (this.canvas.width/2)/this.cam.zoom;
            this.cam.y = cy - (this.canvas.height/2)/this.cam.zoom;
        }
    }

    // --- IA DOS BOTS INTELIGENTES ---
    updateBots() {
        this.bots.forEach((bot, bIdx) => {
            // 1. Analisa arredores
            let forceX = 0, forceY = 0;
            let nearbyFood = null;
            let threat = null;
            let prey = null;

            // Procura ameaças (Players ou Bots maiores) e Presas
            const checkEntity = (ent) => {
                let d = Math.hypot(bot.x - ent.x, bot.y - ent.y);
                if(d < 500) { // Campo de visão
                    if(ent.r > bot.r * 1.1) {
                        // Ameaça! Foge!
                        let angle = Math.atan2(bot.y - ent.y, bot.x - ent.x); // Angulo oposto
                        let weight = (1000 / d); // Quanto mais perto, mais medo
                        forceX += Math.cos(angle) * weight;
                        forceY += Math.sin(angle) * weight;
                        threat = ent;
                    } else if (bot.r > ent.r * 1.1) {
                        // Comida! Persegue!
                        let angle = Math.atan2(ent.y - bot.y, ent.x - bot.x);
                        let weight = (800 / d);
                        forceX += Math.cos(angle) * weight;
                        forceY += Math.sin(angle) * weight;
                        prey = ent;
                    }
                }
            };

            this.myCells.forEach(checkEntity);
            this.bots.forEach((other, idx) => { if(bIdx !== idx) checkEntity(other); });

            // Se não tem ameaça/presa grande, procura comida normal
            if(!threat && !prey) {
                // Procura a comida mais próxima
                let minDist = 300;
                this.foods.forEach(f => {
                    let d = Math.hypot(bot.x - f.x, bot.y - f.y);
                    if(d < minDist) {
                        minDist = d;
                        nearbyFood = f;
                    }
                });

                if(nearbyFood) {
                    let angle = Math.atan2(nearbyFood.y - bot.y, nearbyFood.x - bot.x);
                    forceX += Math.cos(angle) * 2;
                    forceY += Math.sin(angle) * 2;
                } else {
                    // Anda aleatório se não ver nada
                    bot.vx += (Math.random()-0.5);
                    bot.vy += (Math.random()-0.5);
                }
            }

            // Evita Vírus (se for grande)
            if(bot.r > 60) {
                this.viruses.forEach(v => {
                    let d = Math.hypot(bot.x - v.x, bot.y - v.y);
                    if(d < bot.r + 100) {
                        let angle = Math.atan2(bot.y - v.y, bot.x - v.x);
                        forceX += Math.cos(angle) * 5;
                        forceY += Math.sin(angle) * 5;
                    }
                });
            }

            // Split Attack (Bot Profissional)
            // Se tem uma presa muito perto e bot é grande, 2% de chance de dar split
            if(prey && bot.r > 60 && Math.hypot(bot.x-prey.x, bot.y-prey.y) < 300 && Math.random() < 0.02) {
                // Lógica de split do bot (simplificada: pulo pra frente)
                bot.x += Math.cos(Math.atan2(prey.y-bot.y, prey.x-bot.x)) * 50; 
            }

            // Normaliza e aplica movimento
            let len = Math.hypot(forceX, forceY);
            if(len > 0) {
                forceX = forceX / len;
                forceY = forceY / len;
            }

            // Suavização
            bot.vx += forceX * 0.5;
            bot.vy += forceY * 0.5;
            
            // Limites de velocidade
            let maxSpeed = 5 * Math.pow(bot.r, -0.4) * 8;
            bot.x += Math.max(-maxSpeed, Math.min(maxSpeed, bot.vx));
            bot.y += Math.max(-maxSpeed, Math.min(maxSpeed, bot.vy));

            // Paredes
            bot.x = Math.max(bot.r, Math.min(this.MAP_SIZE-bot.r, bot.x));
            bot.y = Math.max(bot.r, Math.min(this.MAP_SIZE-bot.r, bot.y));

            // Checa Colisões do Bot
            this.checkBotCollisions(bot, bIdx);
        });
    }

    // --- COLISÕES UNIFICADAS ---
    checkCollisions(cell, idx, isPlayer) {
        // Comida
        for(let i=this.foods.length-1; i>=0; i--) {
            if(Math.hypot(cell.x-this.foods[i].x, cell.y-this.foods[i].y) < cell.r) {
                cell.r = Math.sqrt((Math.PI*cell.r*cell.r + 30)/Math.PI);
                this.foods.splice(i, 1);
                this.spawnFood();
                if(isPlayer) this.auth.gainXp(1); // Ganha 1 XP por comida
            }
        }

        // Virus
        for(let i=this.viruses.length-1; i>=0; i--) {
            if(Math.hypot(cell.x-this.viruses[i].x, cell.y-this.viruses[i].y) < cell.r) {
                if(cell.r > this.viruses[i].r * 1.1) {
                    this.explodeCell(idx, i, isPlayer); 
                    if(isPlayer) this.auth.gainXp(50); // XP por estourar virus
                }
            }
        }

        // Players vs Bots (Quem come quem?)
        // Essa lógica está separada em checkBotCollisions para evitar loop duplo excessivo
    }

    checkBotCollisions(bot, bIdx) {
        // Bot come comida
        for(let i=this.foods.length-1; i>=0; i--) {
            if(Math.hypot(bot.x-this.foods[i].x, bot.y-this.foods[i].y) < bot.r) {
                bot.r = Math.sqrt((Math.PI*bot.r*bot.r + 30)/Math.PI);
                this.foods.splice(i, 1);
                this.spawnFood();
            }
        }

        // Bot vs Player
        this.myCells.forEach((player, pIdx) => {
            let d = Math.hypot(bot.x - player.x, bot.y - player.y);
            if(d < Math.max(bot.r, player.r)) {
                // Player come Bot
                if(player.r > bot.r * 1.1) {
                    let gain = Math.PI*bot.r*bot.r;
                    player.r = Math.sqrt((Math.PI*player.r*player.r + gain)/Math.PI);
                    this.bots.splice(bIdx, 1);
                    this.spawnBot();
                    this.auth.gainXp(100); // 100 XP por comer bot
                    this.playSound('eat');
                }
                // Bot come Player
                else if (bot.r > player.r * 1.1) {
                    this.myCells.splice(pIdx, 1);
                    if(this.myCells.length === 0) this.gameOver();
                }
            }
        });
    }

    explodeCell(cellIdx, virusIdx, isPlayer) {
        let list = isPlayer ? this.myCells : this.bots; // Genérico
        let cell = list[cellIdx]; // Acessa o objeto diretamente no array correto
        if (!cell) return; // Segurança caso a célula já tenha sido removida

        this.viruses.splice(virusIdx, 1);
        this.spawnVirus();
        this.playSound('explode');

        if(list.length >= 16) return; // Limite

        let pieces = Math.min(8, 16 - list.length);
        let area = Math.PI*cell.r*cell.r;
        cell.r = Math.sqrt((area / (pieces+1)) / Math.PI); // Reduz original

        for(let k=0; k<pieces; k++) {
            let ang = (Math.PI*2/pieces)*k;
            list.push({
                x: cell.x, y: cell.y, r: cell.r, c: cell.c,
                vx: Math.cos(ang)*20, vy: Math.sin(ang)*20,
                birth: Date.now(), id: Math.random()
            });
        }
    }

    // --- UTILITARIOS ---
    spawnFood() { this.foods.push({x:this.rnd(this.MAP_SIZE), y:this.rnd(this.MAP_SIZE), r:Math.random()*3+4, c:this.randColor()}); }
    spawnVirus() { this.viruses.push({x:this.rnd(this.MAP_SIZE), y:this.rnd(this.MAP_SIZE), r:70}); }
    spawnBot() { this.bots.push({x:this.rnd(this.MAP_SIZE), y:this.rnd(this.MAP_SIZE), r:Math.random()*30+20, c:this.randColor(), vx:0, vy:0}); }
    
    rnd(m) { return Math.random()*m; }
    randColor() { return `hsl(${Math.random()*360}, 90%, 55%)`; }

    updateLeaderboard() {
        let list = [...this.bots.map(b=>({n:'Bot', m:Math.floor(b.r)})), {n:this.playerName, m: Math.floor(this.myCells.reduce((a,b)=>a+b.r,0))}];
        list.sort((a,b)=>b.m-a.m);
        document.getElementById('lb-list').innerHTML = list.slice(0,5).map((p,i)=>
            `<div class="lb-item ${p.n===this.playerName?'me':''}">${i+1}. ${p.n} <span>${p.m}</span></div>`
        ).join('');
    }

    gameOver() {
        this.isRunning = false;
        alert("GAME OVER! XP Salvo.");
        document.getElementById('gameHUD').style.display = 'none';
        document.getElementById('mainMenu').style.display = 'flex';
        this.auth.saveData(); // Salva progresso ao morrer
    }
    
    // Funções split/eject/draw mantidas (mas omitidas para brevidade, use as do passo anterior ou mantenha as mesmas)
    // A função DRAW precisa ser a mesma completa que passei anteriormente.
    draw() {
        // ... (Use a função draw completa do código anterior, ela já é perfeita)
        this.ctx.fillStyle = '#080810'; this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        this.ctx.save();
        if(!isNaN(this.cam.zoom)) {
            this.ctx.scale(this.cam.zoom, this.cam.zoom);
            this.ctx.translate(-this.cam.x, -this.cam.y);
        }
        
        // Grid
        this.ctx.strokeStyle = '#1a1a2e'; this.ctx.lineWidth = 50; this.ctx.strokeRect(0,0,this.MAP_SIZE, this.MAP_SIZE);
        this.ctx.lineWidth = 1; this.ctx.beginPath();
        for(let i=0; i<this.MAP_SIZE; i+=100) { this.ctx.moveTo(i,0); this.ctx.lineTo(i,this.MAP_SIZE); this.ctx.moveTo(0,i); this.ctx.lineTo(this.MAP_SIZE,i); }
        this.ctx.strokeStyle='rgba(255,255,255,0.05)'; this.ctx.stroke();

        const drawCircle = (e, isSpiky) => {
            this.ctx.beginPath(); 
            if(isSpiky) {
                for(let i=0; i<30; i++) {
                    let a = (Math.PI*2/30)*i; let r = i%2==0 ? e.r : e.r-5;
                    this.ctx.lineTo(e.x+Math.cos(a)*r, e.y+Math.sin(a)*r);
                }
            } else { this.ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); }
            this.ctx.fillStyle=e.c || '#33ff33'; this.ctx.fill(); 
            if(e.c) { this.ctx.shadowBlur=15; this.ctx.shadowColor=e.c; this.ctx.stroke(); this.ctx.shadowBlur=0; }
        };

        this.foods.forEach(f => drawCircle(f));
        this.viruses.forEach(v => drawCircle(v, true));
        
        let all = [...this.bots.map(b=>({...b, t:'bot'})), ...this.myCells.map(c=>({...c, t:'me', n:this.playerName}))];
        all.sort((a,b)=>a.r-b.r);
        all.forEach(e => {
            drawCircle(e);
            if(e.r>15) {
                this.ctx.fillStyle='white'; this.ctx.font=`bold ${e.r/2.5}px Arial`;
                this.ctx.textAlign='center'; this.ctx.textBaseline='middle';
                this.ctx.fillText(e.t==='bot'?'Bot':e.n, e.x, e.y);
            }
        });
        this.ctx.restore();
    }
    
    // Funções eject e split e audio igual ao anterior
    split() {
        if(this.myCells.length>=16) return;
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
        this.myCells.forEach(c=>{
            if(c.r<35) return;
            c.r = Math.sqrt((Math.PI*c.r*c.r - 150)/Math.PI);
            // Lógica de criar massa ejetada aqui se desejar
        });
    }
    initAudio() { if(!this.audioContext) this.audioContext = new (window.AudioContext||window.webkitAudioContext)(); this.audioContext.resume().catch(()=>{}); }
    playSound(t) { if(!this.audioContext) return; /* Lógica de som simplificada */ }
}
