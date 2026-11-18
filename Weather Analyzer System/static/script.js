
const API = "https://api.open-meteo.com/v1/forecast";
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const ARCHIVE_API = "https://archive-api.open-meteo.com/v1/archive";

async function getWeather() {
    const response = await fetch(
        "http://127.0.0.1:8000/api/weather"
    );

    const data = await response.json();

    console.log(data);
}

getWeather();

const $ = id => document.getElementById(id);

let currentCity = { name: "Karachi", country: "Pakistan", latitude: 24.8607, longitude: 67.0011, timezone: "Asia/Karachi" };
let currentWeather = null;
let chartInstance = null;
let chartMode = "temperature";
let fahrenheit = false;
let lastHistory = [];
let toastTimer;

const weatherDescriptions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Freezing drizzle",
    57: "Heavy freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm"
};

function weatherIcon(code, isDay = 1) {
    if (code === 0) return isDay ? "fa-sun" : "fa-moon";
    if ([1, 2].includes(code)) return isDay ? "fa-cloud-sun" : "fa-cloud-moon";
    if (code === 3) return "fa-cloud";
    if ([45, 48].includes(code)) return "fa-smog";
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "fa-cloud-rain";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "fa-snowflake";
    if ([95, 96, 99].includes(code)) return "fa-cloud-bolt";
    return "fa-cloud-sun";
}

function describe(code) {
    return weatherDescriptions[code] || "Unknown conditions";
}

function celsius(value) {
    return fahrenheit ? value * 9 / 5 + 32 : value;
}

function temp(value, digits = 0) {
    if (value == null || !Number.isFinite(Number(value))) return "--";
    return celsius(Number(value)).toFixed(digits);
}

function tempLabel(value, digits = 0) {
    return `${temp(value, digits)}°${fahrenheit ? "F" : "C"}`;
}

function safeNumber(value, digits = 0) {
    return value == null || !Number.isFinite(Number(value)) ? "--" : Number(value).toFixed(digits);
}

function localDate(dateString, options = { weekday: "short", day: "numeric", month: "short" }) {
    return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-US", options);
}

function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function setStatus(message = "") {
    $("statusMessage").textContent = message;
    $("statusMessage").classList.toggle("show", Boolean(message));
}

function setLoading(isLoading) {
    $("refreshBtn").disabled = isLoading;
    $("refreshBtn").style.opacity = isLoading ? ".5" : "1";
}

async function getJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
    return response.json();
}

function setLocation(city) {
    currentCity = city;
    $("cityInput").value = city.name;
    $("heroCity").textContent = [city.name, city.country].filter(Boolean).join(", ");
}

function updateClock(timezone) {
    try {
        $("heroTime").textContent = new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: timezone || "auto"
        }).format(new Date());
    } catch {
        $("heroTime").textContent = new Date().toLocaleString();
    }
}

function uvDescription(value) {
    if (value < 3) return "Low exposure";
    if (value < 6) return "Moderate exposure";
    if (value < 8) return "High exposure";
    if (value < 11) return "Very high exposure";
    return "Extreme exposure";
}

async function searchCity(name) {
    const url = `${GEO_API}?name=${encodeURIComponent(name)}&count=10&language=en&format=json`;
    const data = await getJSON(url);
    if (!data.results?.length) throw new Error("City not found. Try another spelling.");

    const results = data.results;
    const preferred = results.find(item =>
        item.name.toLowerCase() === name.trim().toLowerCase()
    ) || results[0];

    return {
        name: preferred.name,
        country: preferred.country || "",
        latitude: preferred.latitude,
        longitude: preferred.longitude,
        timezone: preferred.timezone || "auto",
        admin1: preferred.admin1 || ""
    };
}

async function fetchForecast(city) {
    const params = new URLSearchParams({
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: city.timezone || "auto",
        forecast_days: "7",
        past_days: "7",
        current: [
            "temperature_2m", "relative_humidity_2m", "apparent_temperature",
            "is_day", "precipitation", "weather_code", "cloud_cover",
            "pressure_msl", "wind_speed_10m", "wind_direction_10m",
            "visibility"
        ].join(","),
        hourly: [
            "temperature_2m", "relative_humidity_2m", "precipitation_probability",
            "precipitation", "weather_code", "uv_index"
        ].join(","),
        daily: [
            "weather_code", "temperature_2m_max", "temperature_2m_min",
            "precipitation_sum", "precipitation_probability_max",
            "wind_speed_10m_max", "uv_index_max", "sunrise", "sunset"
        ].join(","),
        temperature_unit: "celsius",
        wind_speed_unit: "kmh",
        precipitation_unit: "mm"
    });

    return getJSON(`${API}?${params}`);
}

async function fetchHistory(city) {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() - 5);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);

    const dateString = d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    };

    const params = new URLSearchParams({
        latitude: city.latitude,
        longitude: city.longitude,
        start_date: dateString(start),
        end_date: dateString(end),
        timezone: city.timezone || "auto",
        daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
        temperature_unit: "celsius",
        wind_speed_unit: "kmh",
        precipitation_unit: "mm"
    });

    return getJSON(`${ARCHIVE_API}?${params}`);
}

function updateCurrent(data) {
    const c = data.current;
    const units = data.current_units || {};
    const daily = data.daily;
    currentWeather = data;

    $("heroTemp").textContent = tempLabel(c.temperature_2m);
    $("heroCondition").textContent = describe(c.weather_code);
    $("heroIcon").innerHTML = `<i class="fa-solid ${weatherIcon(c.weather_code, c.is_day)}"></i>`;
    $("feelsLike").textContent = tempLabel(c.apparent_temperature);
    $("feelsMetric").innerHTML = `${temp(c.apparent_temperature)}<small>°${fahrenheit ? "F" : "C"}</small>`;

    $("humidity").innerHTML = `${safeNumber(c.relative_humidity_2m)}<small>%</small>`;
    $("humidityBar").style.width = `${Math.min(100, Math.max(0, c.relative_humidity_2m || 0))}%`;

    $("windSpeed").innerHTML = `${safeNumber(c.wind_speed_10m)}<small> km/h</small>`;
    $("windDirection").textContent = `Direction ${safeNumber(c.wind_direction_10m)}°`;
    $("windArrow").style.transform = `rotate(${(c.wind_direction_10m || 0) + 180}deg)`;

    $("cloudCover").innerHTML = `${safeNumber(c.cloud_cover)}<small>%</small>`;
    $("cloudBar").style.width = `${Math.min(100, Math.max(0, c.cloud_cover || 0))}%`;

    const hourIndex = Math.max(0, data.hourly.time.findIndex(t => t.slice(0, 13) === c.time.slice(0, 13)));
    const uv = data.hourly.uv_index?.[hourIndex];
    $("uvIndex").textContent = safeNumber(uv, 1);
    $("uvLabel").textContent = uv == null ? "Not available" : uvDescription(uv);

    $("visibility").textContent = c.visibility == null
        ? "--" : `${(c.visibility / 1000).toFixed(1)} km`;
    $("pressure").textContent = c.pressure_msl == null
        ? "--" : `${Math.round(c.pressure_msl)} hPa`;
    $("precipitation").textContent = c.precipitation == null
        ? "--" : `${safeNumber(c.precipitation, 1)} mm`;

    updateClock(data.timezone);
    $("updatedAt").textContent = `Updated ${new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}`;
    $("currentDate").textContent = new Date().toLocaleDateString("en-US", {
        weekday: "short", day: "numeric", month: "short", year: "numeric"
    });

    renderForecast(daily);
    renderChart(data);
    renderInsights(data);
}

function renderForecast(daily) {
    $("forecastGrid").innerHTML = daily.time.map((date, i) => {
        const icon = weatherIcon(daily.weather_code[i]);
        const rain = daily.precipitation_probability_max?.[i];
        const probability = rain == null ? "" : `${Math.round(rain)}% rain`;

        return `
            <article class="forecast-card">
                <div class="forecast-day">${i === 0 ? "Today" : localDate(date, {weekday:"short"})}</div>
                <div class="forecast-date">${localDate(date, {day:"numeric", month:"short"})}</div>
                <div class="forecast-icon"><i class="fa-solid ${icon}"></i></div>
                <div class="forecast-condition">${describe(daily.weather_code[i])}</div>
                <div class="forecast-temp">${temp(daily.temperature_2m_max[i])}° <span>${temp(daily.temperature_2m_min[i])}°</span></div>
                <div class="forecast-rain"><i class="fa-solid fa-droplet"></i> ${probability || `${safeNumber(daily.precipitation_sum?.[i], 1)} mm`}</div>
            </article>`;
    }).join("");
}

function chartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
            legend: {
                position: "bottom",
                labels: { color: "#9ba9c4", usePointStyle: true, pointStyle: "circle", boxWidth: 7, padding: 18, font: { size: 10 } }
            },
            tooltip: {
                backgroundColor: "#1a2540",
                titleColor: "#ffffff",
                bodyColor: "#d4def3",
                borderColor: "#ffffff20",
                borderWidth: 1,
                padding: 11,
                displayColors: true
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: "#7f8eaa", font: { size: 10 }, maxRotation: 0 },
                border: { color: "#ffffff10" }
            },
            y: {
                grid: { color: "#ffffff0b" },
                ticks: { color: "#7f8eaa", font: { size: 10 } },
                border: { display: false }
            }
        }
    };
}

function renderChart(data) {
    const daily = data.daily;
    const labels = daily.time.map(date => localDate(date, { weekday: "short", day: "numeric" }));

    const datasets = chartMode === "temperature"
        ? [
            {
                label: `Maximum (°${fahrenheit ? "F" : "C"})`,
                data: daily.temperature_2m_max.map(v => Number(temp(v, 1))),
                borderColor: "#a08aff",
                backgroundColor: "#a08aff22",
                pointBackgroundColor: "#b4a2ff",
                pointRadius: 3,
                borderWidth: 2,
                tension: .4,
                fill: true
            },
            {
                label: `Minimum (°${fahrenheit ? "F" : "C"})`,
                data: daily.temperature_2m_min.map(v => Number(temp(v, 1))),
                borderColor: "#4ed9ee",
                backgroundColor: "#4ed9ee0c",
                pointBackgroundColor: "#4ed9ee",
                pointRadius: 3,
                borderWidth: 2,
                tension: .4,
                fill: true
            }
        ]
        : [
            {
                label: "Rainfall (mm)",
                data: daily.precipitation_sum,
                backgroundColor: daily.precipitation_sum.map(() => "#4ed9eea0"),
                borderRadius: 5,
                borderSkipped: false,
                maxBarThickness: 35
            }
        ];

    $("chartTitle").textContent = chartMode === "temperature" ? "Temperature Trends" : "Rainfall Analysis";
    $("chartSubtitle").textContent = chartMode === "temperature"
        ? "Daily maximum and minimum temperatures"
        : "Daily precipitation totals in millimetres";

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart($("weatherChart"), {
        type: chartMode === "temperature" ? "line" : "bar",
        data: { labels, datasets },
        options: chartOptions()
    });
}

function renderInsights(data) {
    const d = data.daily;
    const maxValues = d.temperature_2m_max;
    const minValues = d.temperature_2m_min;
    const rainValues = d.precipitation_sum;
    const hottestIndex = maxValues.indexOf(Math.max(...maxValues));
    const coldestIndex = minValues.indexOf(Math.min(...minValues));
    const rainTotal = rainValues.reduce((sum, value) => sum + (value || 0), 0);
    const avgMax = maxValues.reduce((sum, value) => sum + value, 0) / maxValues.length;
    const avgHumidity = data.current.relative_humidity_2m;
    const uv = data.hourly.uv_index || [];
    const maxUv = Math.max(...uv.filter(Number.isFinite), 0);

    const insights = [
        {
            icon: "fa-temperature-high", color: "orange",
            title: "Warmest upcoming day",
            text: `${localDate(d.time[hottestIndex])} may reach ${tempLabel(maxValues[hottestIndex])}.`
        },
        {
            icon: "fa-temperature-low", color: "cyan",
            title: "Coolest upcoming day",
            text: `${localDate(d.time[coldestIndex])} may drop to ${tempLabel(minValues[coldestIndex])}.`
        },
        {
            icon: "fa-cloud-rain", color: "purple",
            title: "Rainfall outlook",
            text: rainTotal > 0
                ? `Forecast rainfall totals approximately ${rainTotal.toFixed(1)} mm over 7 days.`
                : "No measurable rainfall is currently forecast for the next 7 days."
        },
        {
            icon: "fa-chart-line", color: "blue",
            title: "Temperature pattern",
            text: `Average daily high is ${tempLabel(avgMax)}. Current humidity is ${avgHumidity}%.`
        },
        {
            icon: "fa-sun", color: "orange",
            title: "UV exposure",
            text: `Maximum hourly UV index in the returned data is ${maxUv.toFixed(1)}.`
        }
    ];

    $("insightsList").innerHTML = insights.map(item => `
        <div class="insight-item">
            <span class="insight-icon ${item.color}"><i class="fa-solid ${item.icon}"></i></span>
            <div><strong>${item.title}</strong><p>${item.text}</p></div>
        </div>`).join("");
}

async function loadHistory(city) {
    $("historyBody").innerHTML = '<tr><td colspan="5">Fetching historical records...</td></tr>';

    try {
        const data = await fetchHistory(city);
        if (!data.daily?.time?.length) throw new Error("No historical records available.");

        lastHistory = data.daily.time.map((date, i) => ({
            date,
            max: data.daily.temperature_2m_max[i],
            min: data.daily.temperature_2m_min[i],
            rain: data.daily.precipitation_sum[i],
            wind: data.daily.wind_speed_10m_max[i]
        }));

        $("historyBody").innerHTML = lastHistory.map(row => `
            <tr>
                <td>${localDate(row.date, {day:"numeric", month:"short", year:"numeric"})}</td>
                <td>${tempLabel(row.max)}</td>
                <td>${tempLabel(row.min)}</td>
                <td>${safeNumber(row.rain, 1)} mm</td>
                <td>${safeNumber(row.wind, 1)}</td>
            </tr>`).join("");

        const validMax = lastHistory.map(r => r.max).filter(Number.isFinite);
        const validMin = lastHistory.map(r => r.min).filter(Number.isFinite);
        const validRain = lastHistory.map(r => r.rain).filter(Number.isFinite);
        const validWind = lastHistory.map(r => r.wind).filter(Number.isFinite);

        const average = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

        $("avgTemp").textContent = average([...validMax, ...validMin]) == null
            ? "--" : tempLabel(average([...validMax, ...validMin]), 1);
        $("maxTemp").textContent = validMax.length ? tempLabel(Math.max(...validMax)) : "--";
        $("totalRain").textContent = validRain.length ? `${validRain.reduce((a, b) => a + b, 0).toFixed(1)} mm` : "--";
        $("avgWind").textContent = average(validWind) == null ? "--" : `${average(validWind).toFixed(1)} km/h`;
    } catch (error) {
        lastHistory = [];
        $("historyBody").innerHTML = `<tr><td colspan="5">Historical archive unavailable. ${error.message}</td></tr>`;
        $("avgTemp").textContent = "--";
        $("maxTemp").textContent = "--";
        $("totalRain").textContent = "--";
        $("avgWind").textContent = "--";
    }
}

async function loadWeather(city, showMessage = true) {
    setLoading(true);
    setStatus("");

    try {
        const data = await fetchForecast(city);
        setLocation(city);
        updateCurrent(data);
        await loadHistory(city);
        if (showMessage) showToast(`Weather loaded for ${city.name}`);
    } catch (error) {
        console.error(error);
        setStatus("Unable to load weather. Check your internet connection and try another city. " + error.message);
        showToast("Could not load weather data.");
    } finally {
        setLoading(false);
    }
}

$("searchForm").addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("cityInput").value.trim();
    if (!name) {
        showToast("Please enter a city name.");
        return;
    }

    setStatus("Searching for city and fetching weather...");
    try {
        const city = await searchCity(name);
        await loadWeather(city);
    } catch (error) {
        setStatus(error.message || "City search failed. Please try again.");
    }
});

document.querySelectorAll(".saved-city").forEach(button => {
    button.addEventListener("click", async () => {
        $("cityInput").value = button.dataset.city;
        try {
            const city = await searchCity(button.dataset.city);
            await loadWeather(city);
        } catch (error) {
            setStatus(error.message);
        }
        if (window.innerWidth <= 850) $("sidebar").classList.remove("open");
    });
});

$("unitToggle").addEventListener("click", () => {
    fahrenheit = !fahrenheit;
    $("unitToggle").textContent = fahrenheit ? "°F" : "°C";

    if (currentWeather) {
        updateCurrent(currentWeather);
        renderChart(currentWeather);
    }
    if (lastHistory.length) {
        $("historyBody").innerHTML = lastHistory.map(row => `
            <tr>
                <td>${localDate(row.date, {day:"numeric", month:"short", year:"numeric"})}</td>
                <td>${tempLabel(row.max)}</td>
                <td>${tempLabel(row.min)}</td>
                <td>${safeNumber(row.rain, 1)} mm</td>
                <td>${safeNumber(row.wind, 1)}</td>
            </tr>`).join("");
        const values = lastHistory.flatMap(r => [r.max, r.min]).filter(Number.isFinite);
        $("avgTemp").textContent = values.length
            ? tempLabel(values.reduce((a, b) => a + b, 0) / values.length, 1)
            : "--";
        const highs = lastHistory.map(r => r.max).filter(Number.isFinite);
        $("maxTemp").textContent = highs.length ? tempLabel(Math.max(...highs)) : "--";
    }
});

$("refreshBtn").addEventListener("click", () => loadWeather(currentCity, false));

$("locationBtn").addEventListener("click", () => {
    if (!navigator.geolocation) {
        showToast("Your browser does not support geolocation.");
        return;
    }

    showToast("Requesting location permission...");
    navigator.geolocation.getCurrentPosition(async position => {
        const { latitude, longitude } = position.coords;
        try {
            const url = `${GEO_API}?latitude=${latitude}&longitude=${longitude}&count=1&language=en&format=json`;
            const data = await getJSON(url);
            const place = data.results?.[0];

            const city = {
                name: place?.name || "My Location",
                country: place?.country || "",
                latitude,
                longitude,
                timezone: place?.timezone || "auto"
            };

            await loadWeather(city);
        } catch {
            await loadWeather({
                name: "My Location",
                country: "",
                latitude,
                longitude,
                timezone: "auto"
            });
        }
    }, error => {
        const message = error.code === 1
            ? "Location permission denied. Allow location access in your browser."
            : "Could not get your location. Please search for a city instead.";
        showToast(message);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
});

document.querySelectorAll(".chart-tab").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".chart-tab").forEach(tab => tab.classList.remove("active"));
        button.classList.add("active");
        chartMode = button.dataset.chart;
        if (currentWeather) renderChart(currentWeather);
    });
});

$("exportBtn").addEventListener("click", () => {
    if (!lastHistory.length) {
        showToast("No historical records available to export.");
        return;
    }

    const rows = [
        ["Date", "Maximum Temperature (C)", "Minimum Temperature (C)", "Rainfall (mm)", "Maximum Wind (km/h)"],
        ...lastHistory.map(r => [r.date, r.max, r.min, r.rain, r.wind])
    ];

    const csv = rows.map(row => row.map(value => {
        const text = String(value ?? "");
        return `"${text.replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `weather-history-${currentCity.name.replace(/[^a-z0-9]/gi, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Historical data exported as CSV.");
});

$("menuToggle").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
});

document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
        link.classList.add("active");
        if (window.innerWidth <= 850) $("sidebar").classList.remove("open");
    });
});

$("footerYear").textContent = new Date().getFullYear();
$("currentDate").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
});

loadWeather(currentCity, false);
const searchBtn = document.getElementById("searchBtn");
const cityInput = document.getElementById("cityInput");

searchBtn.addEventListener("click", getWeather);

async function getWeather() {

    const city = cityInput.value.trim();

    if (!city) {
        alert("Please enter city name");
        return;
    }

    try {

        const response = await fetch(
            `http://127.0.0.1:8000/api/weather?city=${encodeURIComponent(city)}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Weather not found");
        }

        document.getElementById("cityName").textContent =
            data.city + ", " + data.country;

        document.getElementById("temperature").textContent =
            data.temperature + "°C";

        document.getElementById("weatherCondition").textContent =
            data.weather;

        document.getElementById("description").textContent =
            data.description;

        document.getElementById("humidity").textContent =
            data.humidity + "%";

        document.getElementById("windSpeed").textContent =
            data.wind_speed + " m/s";

        document.getElementById("feelsLike").textContent =
            data.feels_like + "°C";

        document.getElementById("pressure").textContent =
            data.pressure + " hPa";

        document.getElementById("clouds").textContent =
            data.clouds + "%";

        document.getElementById("weatherIcon").src =
            `https://openweathermap.org/img/wn/${data.icon}@2x.png`;

    } catch (error) {

        alert(error.message);

    }
}
