from flask import Flask, request, jsonify, render_template
import requests
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Open-Meteo API
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"


# FIND CITY COORDINATES
def get_city_coordinates(city):
    response = requests.get(
        GEOCODING_URL,
        params={
            "name": city,
            "count": 1,
            "language": "en",
            "format": "json"
        },
        timeout=15
    )

    response.raise_for_status()
    results = response.json().get("results", [])

    if not results:
        return None

    return results[0]


# HOME PAGE
@app.route("/")
def home():
    return render_template("index.html")


# CURRENT WEATHER
@app.route("/api/weather")
def get_weather():
    city = request.args.get("city", "").strip()

    if not city:
        return jsonify({"error": "Please enter a city"}), 400

    try:
        location = get_city_coordinates(city)

        if not location:
            return jsonify({"error": "City not found"}), 404

        response = requests.get(
            WEATHER_URL,
            params={
                "latitude": location["latitude"],
                "longitude": location["longitude"],
                "current": (
                    "temperature_2m,"
                    "relative_humidity_2m,"
                    "apparent_temperature,"
                    "is_day,"
                    "precipitation,"
                    "weather_code,"
                    "wind_speed_10m,"
                    "pressure_msl,"
                    "visibility"
                ),
                "timezone": "auto"
            },
            timeout=15
        )

        response.raise_for_status()
        data = response.json()

        return jsonify({
            "city": location["name"],
            "country": location.get("country", ""),
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "current": data["current"],
            "units": data["current_units"]
        })

    except requests.RequestException:
        return jsonify({
            "error": "Weather service is unavailable"
        }), 502


# 7-DAY FORECAST
@app.route("/api/forecast")
def get_forecast():
    city = request.args.get("city", "").strip()

    if not city:
        return jsonify({"error": "Please enter a city"}), 400

    try:
        location = get_city_coordinates(city)

        if not location:
            return jsonify({"error": "City not found"}), 404

        response = requests.get(
            WEATHER_URL,
            params={
                "latitude": location["latitude"],
                "longitude": location["longitude"],
                "daily": (
                    "weather_code,"
                    "temperature_2m_max,"
                    "temperature_2m_min,"
                    "precipitation_sum"
                ),
                "forecast_days": 7,
                "timezone": "auto"
            },
            timeout=15
        )

        response.raise_for_status()
        data = response.json()

        return jsonify({
            "city": location["name"],
            "forecast": data["daily"],
            "units": data["daily_units"]
        })

    except requests.RequestException:
        return jsonify({
            "error": "Forecast service is unavailable"
        }), 502


# START SERVER
if __name__ == "__main__":
    app.run(debug=True, port=5000)