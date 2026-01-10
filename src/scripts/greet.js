        const languages = [
            { text: "Wɔezon", lang: "Ewe" },
            { text: "Hi", lang: "English" },
            { text: "Hello", lang: "English" },
            { text: "Salut", lang: "French" }, 
            { text: "Bonjour", lang: "French" }

        ];

        let currentIndex = 0;
        const helloSpan = document.getElementById('helloText');
        const descText = document.getElementById('langDesc');

        // Initial setup
        updateDescription(0);

        setInterval(() => {
            // 1. Slide Out to the right
            helloSpan.classList.add('slide-out');

            // Wait for slide out to finish (500ms matches CSS)
            setTimeout(() => {
                // Increment index
                currentIndex = (currentIndex + 1) % languages.length;
                const nextLang = languages[currentIndex];

                // 2. Prepare hidden state on the left (no animation)
                helloSpan.classList.remove('slide-out');
                helloSpan.classList.add('prepare-slide');
                
                // Update Text
                helloSpan.textContent = nextLang.text;
                updateDescription(currentIndex);

                // Force browser reflow to register the position change
                void helloSpan.offsetWidth; 

                // 3. Slide In to center
                helloSpan.classList.remove('prepare-slide');
            }, 500);

        }, 3000);

        function updateDescription(index) {
            const lang = languages[index];
            if (lang.lang === "Ewe") {
                descText.style.opacity = '1';
                descText.textContent = `Welcome in ${lang.lang}`;
            } else if (lang.lang === "English") {
                descText.style.opacity = '0';
            } else if (lang.text === "Salut") {
                descText.style.opacity = '1';
                descText.textContent = `Hi in ${lang.lang}`;
            } else if (lang.text === "Bonjour") { 
                descText.style.opacity = '1';
                descText.textContent = `Hello in ${lang.lang}`;
            }
        }