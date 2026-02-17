export class AudioManager {
    constructor() {
        this.isPlayingLofi = false;
        this.volume = 0.3;
        
        // Efeitos Sonoros (Gerados via Oscillator ou URLs)
        // Para produção, substitua esses links por arquivos .mp3 reais na pasta assets
        this.sounds = {
            eat: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.m4a'),
            split: new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.m4a'),
            explode: new Audio('https://assets.mixkit.co/active_storage/sfx/270/270-preview.m4a')
        };
        
        this.initLofi();
        this.initSFX();
    }

    initSFX() {
        Object.values(this.sounds).forEach(s => s.volume = 0.2);
    }

    play(effect) {
        if(this.sounds[effect]) {
            const clone = this.sounds[effect].cloneNode(); // Permite sons sobrepostos
            clone.volume = 0.2;
            clone.play().catch(e => {});
        }
    }

    initLofi() {
        const btn = document.getElementById('toggleRadioBtn');
        const slider = document.getElementById('volumeSlider');
        const container = document.getElementById('youtube-frame-container');

        // ID da Lofi Girl no Youtube
        const videoId = "jfKfPfyJRdk"; 

        btn.onclick = () => {
            this.isPlayingLofi = !this.isPlayingLofi;
            btn.innerHTML = this.isPlayingLofi ? '⏸️' : '▶️';
            
            if(this.isPlayingLofi) {
                container.innerHTML = `
                <iframe id="lofiFrame" width="1" height="1" 
                src="https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&enablejsapi=1" 
                frameborder="0" allow="autoplay; encrypted-media"></iframe>`;
                container.style.display = 'block';
            } else {
                container.innerHTML = '';
                container.style.display = 'none';
            }
        };

        slider.oninput = (e) => {
            // Nota: Controle de volume real em iframe do YouTube requer API complexa.
            // Aqui estamos apenas simulando o controle visual para SFX, 
            // mas o ideal é usar uma biblioteca como Youtube Player API.
            Object.values(this.sounds).forEach(s => s.volume = e.target.value / 100);
        };
    }
}
