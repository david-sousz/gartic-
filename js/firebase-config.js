import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// SUBSTITUA ISSO PELA SUA CONFIGURAÇÃO DO FIREBASE CONSOLE
const firebaseConfig = {
    apiKey: "SUA_API_KEY_AQUI",
    authDomain: "SEU_PROJETO.firebaseapp.com",
    projectId: "SEU_PROJETO_ID",
    storageBucket: "SEU_PROJETO.appspot.com",
    messagingSenderId: "NUMERO",
    appId: "ID_DO_APP"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export class AuthManager {
    constructor() {
        this.user = null;
        this.userData = { coins: 0, items: [], skins: [] };
        
        this.initUI();
        
        // Monitora estado do login
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.user = user;
                await this.loadUserData(user);
                this.updateUI(true);
            } else {
                this.user = null;
                this.userData = { coins: 0, items: [] }; // Reset
                this.updateUI(false);
            }
        });
    }

    initUI() {
        document.getElementById('btnLoginGoogle').onclick = () => this.loginGoogle();
    }

    async loginGoogle() {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Erro no login:", error);
            alert("Erro ao logar com Google. Verifique o console.");
        }
    }

    async loadUserData(user) {
        const userRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
            this.userData = docSnap.data();
        } else {
            // Cria usuário novo no banco
            this.userData = {
                username: user.displayName,
                coins: 50, // Bônus de boas vindas
                items: [],
                createdAt: new Date()
            };
            await setDoc(userRef, this.userData);
        }
        
        // Sincroniza moedas com a UI
        this.updateCoinDisplay();
    }

    async saveCoins(amount) {
        if (!this.user) return;
        const userRef = doc(db, "users", this.user.uid);
        await updateDoc(userRef, {
            coins: amount
        });
        this.userData.coins = amount;
        this.updateCoinDisplay();
    }
    
    async addItem(itemId) {
        if (!this.user) return;
        this.userData.items.push(itemId);
        const userRef = doc(db, "users", this.user.uid);
        await updateDoc(userRef, { items: this.userData.items });
    }

    updateCoinDisplay() {
        document.getElementById('menuCoins').innerText = this.userData.coins;
        document.getElementById('storeCoins').innerText = this.userData.coins;
    }

    updateUI(isLoggedIn) {
        if (isLoggedIn) {
            document.getElementById('loginArea').style.display = 'none';
            document.getElementById('userProfile').style.display = 'flex';
            document.getElementById('userAvatar').src = this.user.photoURL;
            document.getElementById('userNameDisplay').innerText = this.user.displayName.split(' ')[0];
        } else {
            document.getElementById('loginArea').style.display = 'block';
            document.getElementById('userProfile').style.display = 'none';
        }
    }
}

export { auth, db };
