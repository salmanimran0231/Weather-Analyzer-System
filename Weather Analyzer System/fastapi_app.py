from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {
        "message": "Weather Analyzer System FastAPI Backend is Running!"
    }

@app.get("/weather")
def weather():
    return {
        "city": "Karachi",
        "temperature": 35,
        "condition": "Sunny"
    }
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {
        "message": "Weather Analyzer System FastAPI Backend is Running!"
    }

@app.get("/weather")
def weather():
    return {
        "city": "Karachi",
        "temperature": 35,
        "condition": "Sunny"
    }