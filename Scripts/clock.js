let clockFormatter = null;
let clockFormatKey = null;
let lastClockText = null;

function updateClock() {
    const clockElement = document.getElementById("clock");
    if (!clockElement || clockElement.style.display === 'none') return;

    const timeFormat = localStorage.getItem("timeFormat") || "12";
    if (timeFormat !== clockFormatKey) {
        clockFormatKey = timeFormat;
        clockFormatter = new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
            hour12: timeFormat === "12"
        });
    }

    const text = clockFormatter.format(new Date());
    if (text !== lastClockText) {
        lastClockText = text;
        clockElement.textContent = text;
    }
}

setInterval(updateClock, 1000);
updateClock();
