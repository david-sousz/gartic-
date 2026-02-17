import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
            apiKey: "AIzaSyCXDfIO53oqtnRgs9jfApf-rZklp4SRbV8",
            authDomain: "gartic-51f3d.firebaseapp.com",
            projectId: "gartic-51f3d",
            storageBucket: "gartic-51f3d.firebasestorage.app",
            messagingSenderId: "844900784609",
            appId: "1:844900784609:web:5fc7dbdf7e83035dee1aa0"
        };

// Inicialização segura
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Erro Firebase (Verifique as chaves):", e);
}

const provider = new GoogleAuthProvider();

export class AuthSystem {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.user = null;
        this.userData = { coins: 0, items: [] };

        if (!auth) return;

        // Botão de Login
        const btnLogin = document.getElementById('btnLogin');
        if (btnLogin) btnLogin.onclick = () => this.login();

        // Monitorar Status
        onAuthStateChanged(auth, async (u) => {
            if (u) {
                this.user = u;
                await this.loadProfile();
                this.updateUI(true);
            } else {
                this.updateUI(false);
            }
        });
    }

    async login() {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            alert("Erro no login: " + error.message);
        }
    }

    async loadProfile() {
        if (!this.user || !db) return;
        const ref = doc(db, "users", this.user.uid);
        try {
            const snap = await getDoc(ref);
            if (snap.exists()) {
                this.userData = snap.data();
            } else {
                // Novo usuário
                this.userData = { coins: 50, items: [], name: this.user.displayName };
                await setDoc(ref, this.userData);
            }
            this.game.updateCoins(this.userData.coins);
        } catch (e) { console.error("Erro perfil:", e); }
    }

    async saveCoins(amount) {
        if (!this.user || !db) return;
        this.userData.coins = amount;
        await updateDoc(doc(db, "users", this.user.uid), { coins: amount });
    }

    async saveItem(item) {
        if (!this.user || !db) return;
        this.userData.items.push(item);
        await updateDoc(doc(db, "users", this.user.uid), { items: this.userData.items });
    }

    updateUI(logged) {
        if (logged) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('profileSection').style.display = 'flex';
            document.getElementById('userAvatar').src = this.user.photoURL;
            document.getElementById('userName').innerText = this.user.displayName.split(' ')[0];
        } else {
            document.getElementById('loginSection').style.display = 'block';
            document.getElementById('profileSection').style.display = 'none';
        }
    }
}
