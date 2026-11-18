
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import httpx
import os

# Load environment variables
load_dotenv()

app = FastAPI(title="Weather Analyzer API")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("WEATHER_API_KEY")


@app.get("/")
def home():
    return {
        "message": "Weather Analyzer FastAPI is running!"
    }


@app.get("/api/weather")
async def get_weather(city: str):

    if not API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Weather API key is missing. Check your .env file."
        )

    city = city.strip()

    if not city:
        raise HTTPException(
            status_code=400,
            detail="Please enter a city name."
        )

    try:
        async with httpx.AsyncClient(timeout=20) as client:

            # STEP 1: GET CITY COORDINATES
            geo_url = "https://api.openweathermap.org/geo/1.0/direct"

            geo_response = await client.get(
                geo_url,
                params={
                    "q": city,
                    "limit": 1,
                    "appid": API_KEY
                }
            )

            print("GEO STATUS:", geo_response.status_code)
            print("GEO RESPONSE:", geo_response.text)

            if geo_response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Location API error: {geo_response.status_code}. Check terminal for details."
                )

            locations = geo_response.json()

            if not locations:
                raise HTTPException(
                    status_code=404,
                    detail="City not found. Please enter a valid city name."
                )

            latitude = locations[0]["lat"]
            longitude = locations[0]["lon"]

            # STEP 2: GET WEATHER DATA
            weather_url = "https://api.openweathermap.org/data/2.5/weather"

            weather_response = await client.get(
                weather_url,
                params={
                    "lat": latitude,
                    "lon": longitude,
                    "appid": API_KEY,
                    "units": "metric"
                }
            )

            print("WEATHER STATUS:", weather_response.status_code)
            print("WEATHER RESPONSE:", weather_response.text)

            if weather_response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Weather API error: {weather_response.status_code}. Check terminal for details."
                )

            data = weather_response.json()

        # STEP 3: RETURN WEATHER INFORMATION
        return {
            "city": data["name"],
            "country": data["sys"]["country"],
            "temperature": data["main"]["temp"],
            "feels_like": data["main"]["feels_like"],
            "humidity": data["main"]["humidity"],
            "pressure": data["main"]["pressure"],
            "wind_speed": data["wind"]["speed"],
            "weather": data["weather"][0]["main"],
            "description": data["weather"][0]["description"],
            "icon": data["weather"][0]["icon"],
            "clouds": data["clouds"]["all"]
        }

    except HTTPException:
        raise

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Weather service request timed out."
        )

    except httpx.RequestError as e:
        print("CONNECTION ERROR:", str(e))
        raise HTTPException(
            status_code=502,
            detail="Unable to connect to weather service."
        )

    except Exception as e:
        print("UNEXPECTED ERROR:", str(e))
        raise HTTPException(
            status_code=500,
            detail="An unexpected server error occurred."
        )
