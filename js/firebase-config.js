import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// ⚠️ SUBSTITUA COM SUAS CHAVES REAIS DO FIREBASE ⚠️
const firebaseConfig = {
            apiKey: "AIzaSyCXDfIO53oqtnRgs9jfApf-rZklp4SRbV8",
            authDomain: "gartic-51f3d.firebaseapp.com",
            projectId: "gartic-51f3d",
            storageBucket: "gartic-51f3d.firebasestorage.app",
            messagingSenderId: "844900784609",
            appId: "1:844900784609:web:5fc7dbdf7e83035dee1aa0"
        };

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) { console.error("Erro Firebase", e); }

const provider = new GoogleAuthProvider();

export class AuthSystem {
    constructor(game) {
        this.game = game;
        this.user = null;
        this.userData = { coins: 0, items: [], level: 1, xp: 0, maxXp: 100 };

        if(!auth) return;

        const btnLogin = document.getElementById('btnLogin');
        if(btnLogin) btnLogin.onclick = () => this.login();

        onAuthStateChanged(auth, async (u) => {
            if(u) {
                this.user = u;
                await this.loadProfile();
                this.updateMenuUI(true);
            } else {
                this.updateMenuUI(false);
            }
        });
    }

    async login() {
        try { await signInWithPopup(auth, provider); } catch(e) { alert(e.message); }
    }

    async loadProfile() {
        if(!this.user) return;
        const ref = doc(db, "users", this.user.uid);
        const snap = await getDoc(ref);
        
        if(snap.exists()) {
            this.userData = snap.data();
            // Garante campos novos se conta for antiga
            if(!this.userData.level) this.userData.level = 1;
            if(!this.userData.xp) this.userData.xp = 0;
            if(!this.userData.maxXp) this.userData.maxXp = 100;
        } else {
            this.userData = { 
                name: this.user.displayName, 
                coins: 50, items: [], 
                level: 1, xp: 0, maxXp: 100 
            };
            await setDoc(ref, this.userData);
        }
        this.updateMenuUI(true);
    }

    // --- SISTEMA DE XP ---
    gainXp(amount) {
        if(!this.user) return; // Só upa se logado
        
        this.userData.xp += amount;
        
        // Level Up Logic
        if(this.userData.xp >= this.userData.maxXp) {
            this.userData.xp -= this.userData.maxXp;
            this.userData.level++;
            this.userData.maxXp = Math.floor(this.userData.maxXp * 1.2); // +20% dificuldade
            // Efeito visual de Level UP poderia ser aqui
            console.log("LEVEL UP! " + this.userData.level);
        }

        // Atualiza UI in-game
        this.updateGameHUD();
        
        // Salva periodicamente (não a cada frame)
        if(Math.random() < 0.05) this.saveData(); 
    }

    async saveData() {
        if(!this.user) return;
        const ref = doc(db, "users", this.user.uid);
        await updateDoc(ref, {
            coins: this.userData.coins,
            items: this.userData.items,
            level: this.userData.level,
            xp: this.userData.xp,
            maxXp: this.userData.maxXp
        });
    }

    updateMenuUI(logged) {
        if(logged) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('profileCard').style.display = 'flex';
            document.getElementById('userAvatar').src = this.user.photoURL;
            document.getElementById('userName').innerText = this.userData.name;
            document.getElementById('levelBadge').innerText = this.userData.level;
            document.getElementById('coinDisplay').innerText = this.userData.coins;
            
            // Barra XP Menu
            const pct = (this.userData.xp / this.userData.maxXp) * 100;
            document.getElementById('menuXpBar').style.width = pct + '%';
            document.getElementById('menuXpText').innerText = `${Math.floor(this.userData.xp)} / ${this.userData.maxXp} XP`;
        } else {
            document.getElementById('loginSection').style.display = 'block';
            document.getElementById('profileCard').style.display = 'none';
        }
    }

    updateGameHUD() {
        document.getElementById('gameLevelVal').innerText = this.userData.level;
        const pct = (this.userData.xp / this.userData.maxXp) * 100;
        document.getElementById('gameXpBar').style.width = pct + '%';
    }
}
