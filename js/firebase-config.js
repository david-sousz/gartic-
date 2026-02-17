import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// SUAS CHAVES REAIS AQUI
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
        this.userData = { coins: 0, items: [], level: 1, xp: 0, maxXp: 100, name: "Jogador" };

        if(!auth) return;

        // Botões
        const btnLogin = document.getElementById('btnLogin');
        if(btnLogin) btnLogin.onclick = () => this.login();
        
        const btnLogout = document.getElementById('btnLogout');
        if(btnLogout) btnLogout.onclick = () => this.logout();

        onAuthStateChanged(auth, async (u) => {
            if(u) {
                this.user = u;
                await this.loadProfile();
            } else {
                this.user = null;
                this.userData = { coins: 0, items: [], level: 1, xp: 0, maxXp: 100, name: "Jogador" };
                this.updateMenuUI(false);
            }
        });
    }

    async login() {
        try { await signInWithPopup(auth, provider); } catch(e) { alert("Erro login: " + e.message); }
    }

    async logout() {
        try { 
            await signOut(auth); 
            location.reload(); 
        } catch(e) { console.error(e); }
    }

    async loadProfile() {
        if(!this.user) return;
        const ref = doc(db, "users", this.user.uid);
        const snap = await getDoc(ref);
        
        let fallbackName = this.user.displayName || "Jogador";

        if(snap.exists()) {
            this.userData = snap.data();
            // Correções de dados antigos
            if(!this.userData.name || this.userData.name === "undefined") this.userData.name = fallbackName;
            if(!this.userData.level) this.userData.level = 1;
            if(!this.userData.maxXp) this.userData.maxXp = 100;
        } else {
            this.userData = { 
                name: fallbackName, 
                coins: 50, items: [], 
                level: 1, xp: 0, maxXp: 100 
            };
            await setDoc(ref, this.userData);
        }
        this.updateMenuUI(true);
    }

    gainXp(amount) {
        if(!this.user) return;
        this.userData.xp += amount;
        if(this.userData.xp >= this.userData.maxXp) {
            this.userData.xp -= this.userData.maxXp;
            this.userData.level++;
            this.userData.maxXp = Math.floor(this.userData.maxXp * 1.2);
            // Efeito visual de level up poderia ser aqui
        }
        this.updateGameHUD();
        // Salva com menos frequência para não estourar cota
        if(Math.random() < 0.2) this.saveData();
    }

    async saveData() {
        if(!this.user) return;
        const ref = doc(db, "users", this.user.uid);
        await updateDoc(ref, this.userData);
    }

    updateMenuUI(logged) {
        if(logged) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('profileCard').style.display = 'flex';
            document.getElementById('userAvatar').src = this.user.photoURL || 'https://www.gravatar.com/avatar/?d=mp';
            document.getElementById('userName').innerText = this.userData.name || "Jogador";
            document.getElementById('levelBadge').innerText = this.userData.level;
            document.getElementById('coinDisplay').innerText = this.userData.coins;
            
            const pct = Math.min(100, (this.userData.xp / this.userData.maxXp) * 100);
            document.getElementById('menuXpBar').style.width = pct + '%';
            document.getElementById('menuXpText').innerText = `${Math.floor(this.userData.xp)} XP`;
        } else {
            document.getElementById('loginSection').style.display = 'block';
            document.getElementById('profileCard').style.display = 'none';
        }
    }

    updateGameHUD() {
        document.getElementById('gameLevelVal').innerText = this.userData.level;
        const pct = Math.min(100, (this.userData.xp / this.userData.maxXp) * 100);
        document.getElementById('gameXpBar').style.width = pct + '%';
    }
}
