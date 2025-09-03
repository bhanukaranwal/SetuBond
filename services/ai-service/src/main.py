from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import redis.asyncio as redis
import asyncpg
import os

from models.price_prediction import PricePredictionModel
from models.liquidity_forecasting import LiquidityForecastingModel
from models.credit_risk import CreditRiskModel
from models.recommendation_engine import RecommendationEngine
from services.data_ingestion import DataIngestionService
from services.model_training import ModelTrainingService
from utils.database import Database
