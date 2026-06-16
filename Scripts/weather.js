document.addEventListener('DOMContentLoaded', function () {
    const apiKeyInput = document.getElementById('api-key');
    const locationInput = document.getElementById('location');
    const tempUnitSelect = document.getElementById('temp-unit');
    const weatherWidget = document.getElementById('weather-widget');
    const modal = document.getElementById('weather-settings-modal');
    const closeModalBtn = document.getElementById('close-weather-modal');
    const saveSettingsBtn = document.getElementById('save-weather-settings');

    function openModal() {
        modal.style.display = 'block';
        const gap = 8;
        const w = weatherWidget.getBoundingClientRect();
        const mw = modal.offsetWidth, mh = modal.offsetHeight;

        let left = Math.max(gap, Math.min(w.left, window.innerWidth - mw - gap));
        let top = w.bottom + gap;
        if (top + mh + gap > window.innerHeight) top = w.top - mh - gap;
        top = Math.max(gap, top);

        modal.style.top = `${top}px`;
        modal.style.left = `${left}px`;
        modal.classList.add('show');
        apiKeyInput.value = localStorage.getItem('apiKey') || '';
        locationInput.value = localStorage.getItem('location') || '';
        tempUnitSelect.value = localStorage.getItem('tempUnit') || 'C';
    }

    function closeModal() {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }

    weatherWidget.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);

    saveSettingsBtn.addEventListener('click', () => {
        localStorage.setItem('apiKey', apiKeyInput.value);
        localStorage.setItem('location', locationInput.value);
        localStorage.setItem('tempUnit', tempUnitSelect.value);
        closeModal();
        getWeather();
    });

    async function getWeather() {
        const weatherVisible = localStorage.getItem("weatherVisible") !== 'false';
        
        if (!weatherVisible) {
            console.log('Weather widget is disabled, skipping API call');
            return;
        }
        
        document.getElementById('weather-temperature').innerText = 'Loading...';
        document.getElementById('weather-description').innerText = '';
        
        const apiKey = localStorage.getItem('apiKey') || 'qD9ecsnV7YDX2J0k2GOssB9UNYZ7Z528'; // Free for the normies <3
        const location = localStorage.getItem('location') || '';
        const tempUnit = localStorage.getItem('tempUnit') || 'C';
        
        if (!apiKey || !location) {
            document.getElementById('weather-temperature').innerText = 'Setup';
            document.getElementById('weather-description').innerText = 'Required';
            return;
        }

        const unitMap = { 'C': 'si', 'F': 'us' };
        const pirateUnits = unitMap[tempUnit] || 'us';
        const weatherUrl = `https://api.pirateweather.net/forecast/${apiKey}/${location}?units=${pirateUnits}&exclude=minutely,hourly,daily,alerts,flags`;
        
        try {
            const response = await fetch(weatherUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            if (data?.currently) {
                const temperature = Math.round(data.currently.temperature);
                document.getElementById('weather-temperature').innerText = `${temperature}°${tempUnit}`;
                document.getElementById('weather-description').innerText = data.currently.summary;
            } else {
                throw new Error('Invalid API response format');
            }
        } catch (error) {
            console.error('Error fetching weather data:', error);
            document.getElementById('weather-temperature').innerText = 'Error';
            document.getElementById('weather-description').innerText = 'Check Settings';
        }
    }

    const initialWeatherVisible = localStorage.getItem("weatherVisible") !== 'false';
    if (initialWeatherVisible) {
        getWeather();
    }
    
    window.getWeather = getWeather;
});