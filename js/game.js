import { db, auth } from './firebase-config.js';
import { doc, setDoc, onSnapshot, collection, deleteDoc, serverTimestamp, query } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Configurações
        this.MAP_SIZE = 6000;
        this.myCells = [];
        this.foods = [];
        this.otherPlayers = {};
        this.cam = { x: 0, y: 0, zoom: 1, targetZoom: 1 };
        this.gameRunning = false;
        
        // Inputs
        this.mouse = { x: 0, y: 0 };
        this.joystickVector = { x: 0, y: 0 };
        
        this.bindEvents();
        this.loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    bindEvents() {
        // Play Button
        document.getElementById('btnPlay').onclick = () => this.start();
        
        // Mouse Move
        window.addEventListener('mousemove', e => {
            const cx = window.innerWidth/2;
            const cy = window.innerHeight/2;
            this.joystickVector.x = (e.clientX - cx) / Math.min(cx, cy);
            this.joystickVector.y = (e.clientY - cy) / Math.min(cx, cy);
        });

        // ZOOM MANUAL (Roda do Mouse)
        window.addEventListener('wheel', e => {
            if(!this.gameRunning) return;
            const direction = e.deltaY > 0 ? 0.9 : 1.1;
            this.cam.targetZoom *= direction;
            // Limites do Zoom (0.1x a 2.0x)
            this.cam.targetZoom = Math.max(0.1, Math.min(2.0, this.cam.targetZoom));
        });

        // Teclado
        window.addEventListener('keydown', e => {
            if(e.code === 'Space') this.split();
            if(e.code === 'KeyW') this.eject();
        });

        // Joystick Mobile
        // (Adicione a lógica de toque aqui se necessário, igual ao código original)
        // Botões Mobile
        document.getElementById('btnSplit').addEventListener('touchstart', (e)=>{e.preventDefault(); this.split()});
        document.getElementById('btnEject').addEventListener('touchstart', (e)=>{e.preventDefault(); this.eject()});
    }

    start() {
        const nickname = document.getElementById('nicknameInput').value || window.authManager?.user?.displayName || "Player";
        this.myName = nickname;
        
        // Reseta jogo
        this.myCells = [];
        this.foods = [];
        for(let i=0; i<800; i++) this.spawnFood();
        
        // Verifica itens comprados
        let initialMass = 30;
        const hasStartMass = window.authManager.userData.items.includes('startMass');
        if(hasStartMass) initialMass = 80;

        const hasNeon = window.authManager.userData.items.includes('neonSkin');
        const color = hasNeon ? '#00ff00' : this.getRandomColor();

        this.myCells.push({
            x: Math.random() * this.MAP_SIZE,
            y: Math.random() * this.MAP_SIZE,
            r: initialMass,
            c: color,
            vx: 0, vy: 0,
            id: Math.random()
        });

        document.getElementById('uiLayer').querySelector('#mainMenu').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        this.gameRunning = true;

        // Inicia Sync Rede
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

    getRandomColor() {
        const colors = ['#ff0055', '#00d2ff', '#ffcc00', '#00ff77', '#aa00ff'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // --- LÓGICA DE FÍSICA ---
    update() {
        if(!this.gameRunning) return;

        let totalMass = 0;

        // Suavização do Zoom
        this.cam.zoom += (this.cam.targetZoom - this.cam.zoom) * 0.1;

        this.myCells.forEach((cell, index) => {
            // FÓRMULA DE VELOCIDADE: QUANTO MAIOR, MAIS LENTO
            // r = raio. pow(r, -0.4) faz decair suavemente
            let speed = 8 * Math.pow(cell.r, -0.45) * 6;
            
            // Limite mínimo de velocidade para não ficar imóvel
            speed = Math.max(speed, 1.5);

            cell.x += this.joystickVector.x * speed;
            cell.y += this.joystickVector.y * speed;

            // Inércia de Split (vx, vy)
            if(cell.vx) { cell.x += cell.vx; cell.vx *= 0.9; if(Math.abs(cell.vx)<0.1) cell.vx=0; }
            if(cell.vy) { cell.y += cell.vy; cell.vy *= 0.9; if(Math.abs(cell.vy)<0.1) cell.vy=0; }

            // Limites do Mapa
            cell.x = Math.max(cell.r, Math.min(this.MAP_SIZE-cell.r, cell.x));
            cell.y = Math.max(cell.r, Math.min(this.MAP_SIZE-cell.r, cell.y));

            totalMass += Math.floor(cell.r);

            // Comer Comida
            for(let i=this.foods.length-1; i>=0; i--) {
                let f = this.foods[i];
                let dist = Math.hypot(cell.x - f.x, cell.y - f.y);
                if(dist < cell.r) {
                    // Crescer (Area based)
                    let area = Math.PI * cell.r * cell.r;
                    area += 50; // Ganho por comida
                    cell.r = Math.sqrt(area / Math.PI);
                    
                    this.foods.splice(i, 1);
                    this.spawnFood();
                    window.audioManager.play('eat'); // TOCA SOM
                    
                    // Chance de ganhar moeda
                    if(Math.random() < 0.1) {
                        window.authManager.userData.coins++;
                        window.authManager.updateCoinDisplay();
                    }
                }
            }
        });

        // Game Over Check
        if(this.myCells.length === 0 && this.gameRunning) {
            this.gameOver();
        }

        // Camera Follow (Centróide)
        if(this.myCells.length > 0) {
            let cx=0, cy=0;
            this.myCells.forEach(c => { cx+=c.x; cy+=c.y; });
            this.cam.x = (cx / this.myCells.length) - (this.canvas.width/2)/this.cam.zoom;
            this.cam.y = (cy / this.myCells.length) - (this.canvas.width/2)/this.cam.zoom;
            
            document.getElementById('massDisplay').innerText = totalMass;
        }

        // Salvar moedas no DB a cada tanto tempo se mudou
        if(window.authManager.user && Math.random() < 0.01) {
            window.authManager.saveCoins(window.authManager.userData.coins);
        }
    }

    split() {
        if(this.myCells.length >= 16) return;
        window.audioManager.play('split');
        let newCells = [];
        this.myCells.forEach(cell => {
            if(cell.r < 35) return;
            cell.r /= 1.414;
            newCells.push({
                x: cell.x, y: cell.y, r: cell.r, c: cell.c,
                vx: this.joystickVector.x * 20, vy: this.joystickVector.y * 20,
                id: Math.random()
            });
        });
        this.myCells = this.myCells.concat(newCells);
    }

    eject() {
        // Lógica de ejetar massa (simplificada)
        this.myCells.forEach(c => {
            if(c.r > 30) {
                c.r -= 2;
                // Criar particula ejetada (implementar array ejected se quiser visual)
            }
        });
    }

    draw() {
        // Limpa
        this.ctx.fillStyle = '#050510';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.scale(this.cam.zoom, this.cam.zoom);
        this.ctx.translate(-this.cam.x, -this.cam.y);

        // Grid (Parallax simples)
        this.ctx.strokeStyle = '#1a1a2e';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        for(let x=0; x<this.MAP_SIZE; x+=200) { this.ctx.moveTo(x,0); this.ctx.lineTo(x,this.MAP_SIZE); }
        for(let y=0; y<this.MAP_SIZE; y+=200) { this.ctx.moveTo(0,y); this.ctx.lineTo(this.MAP_SIZE,y); }
        this.ctx.stroke();

        // Comidas
        this.foods.forEach(f => {
            this.ctx.beginPath();
            this.ctx.arc(f.x, f.y, f.r, 0, Math.PI*2);
            this.ctx.fillStyle = f.c;
            this.ctx.fill();
        });

        // Jogadores (Simplificado, desenha todos)
        // ...Adicionar renderização de otherPlayers aqui...

        // Minhas Células
        this.myCells.forEach(c => {
            this.ctx.beginPath();
            this.ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
            this.ctx.fillStyle = c.c;
            
            // Efeito de brilho (Neon Skin)
            if(c.c === '#00ff00') {
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = '#00ff00';
            } else {
                this.ctx.shadowBlur = 0;
            }
            
            this.ctx.fill();
            this.ctx.shadowBlur = 0; // Reset

            // Nome
            this.ctx.fillStyle = 'white';
            this.ctx.font = `bold ${Math.max(10, c.r/2)}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(this.myName, c.x, c.y);
        });

        this.ctx.restore();
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    gameOver() {
        this.gameRunning = false;
        alert("Game Over!");
        document.getElementById('hud').style.display = 'none';
        document.getElementById('uiLayer').querySelector('#mainMenu').style.display = 'flex';
        // Salva moedas finais
        if(window.authManager.user) {
            window.authManager.saveCoins(window.authManager.userData.coins);
        }
    }

    // --- LOJA ---
    openStore() { document.getElementById('storeModal').style.display = 'flex'; }
    closeStore() { document.getElementById('storeModal').style.display = 'none'; }
    
    buyItem(item, price) {
        if(window.authManager.userData.coins >= price) {
            if(window.authManager.userData.items.includes(item)) {
                alert("Você já possui este item!");
                return;
            }
            window.authManager.userData.coins -= price;
            window.authManager.addItem(item);
            window.authManager.saveCoins(window.authManager.userData.coins);
            alert("Item comprado com sucesso!");
        } else {
            alert("Moedas insuficientes!");
        }
    }

    // --- REDE ---
    startNetworkSync() {
        // Enviar dados do player para Firebase periodicamente
        if(window.authManager.user) {
            setInterval(() => {
                if(!this.gameRunning) return;
                const simpleCells = this.myCells.map(c => ({x:Math.round(c.x), y:Math.round(c.y), r:Math.round(c.r), c:c.c}));
                setDoc(doc(db, "players", window.authManager.user.uid), {
                    n: this.myName,
                    cells: simpleCells,
                    t: serverTimestamp()
                }, {merge:true});
            }, 100);
        }
        
        // Receber outros players
        const q = query(collection(db, "players"));
        onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if(window.authManager.user && change.doc.id === window.authManager.user.uid) return;
                if(change.type === "removed") {
                    delete this.otherPlayers[change.doc.id];
                } else {
                    this.otherPlayers[change.doc.id] = change.doc.data();
                }
            });
            this.updateLeaderboard();
        });
    }

    updateLeaderboard() {
        let list = [{n: this.myName, m: this.myCells.reduce((a,b)=>a+b.r,0)}];
        for(let id in this.otherPlayers) {
            let p = this.otherPlayers[id];
            let mass = p.cells ? p.cells.reduce((a,b)=>a+b.r,0) : 0;
            list.push({n: p.n, m: mass});
        }
        list.sort((a,b) => b.m - a.m);
        
        const html = list.slice(0,5).map((p,i) => 
            `<div style="display:flex; justify-content:space-between; color:${p.n===this.myName?'#00d2ff':'white'}">
                <span>${i+1}. ${p.n}</span><span>${Math.floor(p.m)}</span>
            </div>`
        ).join('');
        document.getElementById('lb-content').innerHTML = html;
    }
}
