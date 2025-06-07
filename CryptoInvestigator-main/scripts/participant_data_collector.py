import os
import requests
import json
from datetime import datetime, timedelta
import time

# --- Constants ---
BASE_URL = "https://fapi.binance.com"
DATA_DIR = "data"
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# --- Helper Functions ---
def save_data_to_json(data, filename):
    """Saves data to a JSON file in the data directory."""
    filepath = os.path.join(DATA_DIR, filename)
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=4)
    print(f"Data saved to {filepath}")

def make_api_request(endpoint, params=None):
    """Makes a request to the Binance API with retries."""
    url = f"{BASE_URL}{endpoint}"
    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(url, params=params)
            response.raise_for_status()  # Raise an exception for bad status codes
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"API request failed for {url} with params {params}: {e}")
            if attempt < MAX_RETRIES - 1:
                print(f"Retrying in {RETRY_DELAY} seconds...")
                time.sleep(RETRY_DELAY)
            else:
                print("Max retries reached. Skipping this request.")
                return None

# --- Data Collection Functions ---

def get_funding_rate_history(symbol="BTCUSDT", days_to_fetch=30):
    """
    Fetches funding rate history for a given symbol.
    Binance API returns max 1000 records. If more needed, multiple calls would be required.
    For simplicity, we'll fetch the most recent 'limit' records up to 'days_to_fetch' * (24/8) assuming 8-hour funding intervals.
    The API documentation specifies: "If startTime and endTime are not sent, the most recent limit datas are returned."
    "Default 100; max 1000" for limit.
    To get approximately `days_to_fetch` days of data (assuming 3 funding rates per day):
    limit = days_to_fetch * 3
    """
    print(f"Fetching funding rate history for {symbol} for the last {days_to_fetch} days...")
    # Assuming 3 funding intervals per day (every 8 hours)
    limit = min(days_to_fetch * 3, 1000) # Cap at API max limit
    params = {"symbol": symbol, "limit": limit}
    data = make_api_request("/fapi/v1/fundingRate", params)
    if data:
        save_data_to_json(data, f"{symbol.lower()}_funding_rate.json")
    return data

def get_long_short_ratio(symbol="BTCUSDT", period="1d", days_to_fetch=30):
    """
    Fetches the global long/short account ratio for a given symbol and period.
    API provides data for the latest 30 days.
    """
    print(f"Fetching long/short ratio for {symbol} (period: {period}) for the last {days_to_fetch} days...")
    # API limit is 500, and data is available for last 30 days.
    # If period is '1d', limit=30 will get all available daily data.
    limit = days_to_fetch
    if period != "1d": # Adjust limit for smaller periods if necessary, capped at 500
        intervals_per_day = {"5m": 288, "15m": 96, "30m": 48, "1h": 24, "2h": 12, "4h": 6, "6h": 4, "12h": 2}
        limit = min(days_to_fetch * intervals_per_day.get(period, 1), 500)

    # Removing startTime and endTime to rely on API default for most recent data
    params = {
        "symbol": symbol,
        "period": period,
        "limit": limit
    }
    data = make_api_request("/futures/data/globalLongShortAccountRatio", params)
    if data:
        save_data_to_json(data, f"{symbol.lower()}_long_short_ratio_{period}.json")
    return data

def get_open_interest_history(symbol="BTCUSDT", period="1d", days_to_fetch=30):
    """
    Fetches open interest history for a given symbol and period.
    API provides data for the latest 1 month.
    """
    print(f"Fetching open interest history for {symbol} (period: {period}) for the last {days_to_fetch} days...")
    # API limit is 500, and data is available for last 30 days (1 month).
    # If period is '1d', limit=30 will get all available daily data.
    limit = days_to_fetch
    if period != "1d": # Adjust limit for smaller periods if necessary, capped at 500
        intervals_per_day = {"5m": 288, "15m": 96, "30m": 48, "1h": 24, "2h": 12, "4h": 6, "6h": 4, "12h": 2}
        limit = min(days_to_fetch * intervals_per_day.get(period, 1), 500)

    # Removing startTime and endTime to rely on API default for most recent data
    params = {
        "symbol": symbol,
        "period": period,
        "limit": limit
    }
    data = make_api_request("/futures/data/openInterestHist", params)
    if data:
        save_data_to_json(data, f"{symbol.lower()}_open_interest_{period}.json")
    return data

# --- Main Execution ---
if __name__ == "__main__":
    symbol_to_fetch = "BTCUSDT"
    days_for_funding = 365 # Aim for 1 year, API will limit to 1000 records (approx 333 days)
    days_for_ls_oi = 365  # Aim for 1 year, but API strictly limits these to ~30 days of history.

    print(f"Starting data collection for {symbol_to_fetch}...")

    # 1. Funding Rate History
    print(f"\nFetching funding rate history (aiming for {days_for_funding} days, API max 1000 records)...")
    get_funding_rate_history(symbol_to_fetch, days_to_fetch=days_for_funding)

    # 2. Long/Short Ratio (Global) - Daily
    print(f"\nFetching long/short ratio (aiming for {days_for_ls_oi} days, API will likely return ~30 days due to its limits)...")
    get_long_short_ratio(symbol_to_fetch, period="1d", days_to_fetch=days_for_ls_oi)

    # 3. Open Interest History - Daily
    print(f"\nFetching open interest history (aiming for {days_for_ls_oi} days, API will likely return ~30 days due to its limits)...")
    get_open_interest_history(symbol_to_fetch, period="1d", days_to_fetch=days_for_ls_oi)

    # Example for top trader long/short ratio (accounts) - Daily for 30 days
    # print("\nFetching top trader long/short account ratio...")
    # params_top_trader_ls_account = {
    # "symbol": symbol_to_fetch,
    # "period": "1d",
    # "limit": days, # Max 500, 30 for 30 days
    # "endTime": int(datetime.now().timestamp() * 1000),
    # "startTime": int((datetime.now() - timedelta(days=days)).timestamp() * 1000)
    # }
    # top_trader_ls_account_data = make_api_request("/futures/data/topLongShortAccountRatio", params_top_trader_ls_account)
    # if top_trader_ls_account_data:
    #     save_data_to_json(top_trader_ls_account_data, f"{symbol_to_fetch.lower()}_top_trader_long_short_account_ratio_1d.json")

    # Example for top trader long/short position ratio - Daily for 30 days
    # print("\nFetching top trader long/short position ratio...")
    # params_top_trader_ls_position = {
    #     "symbol": symbol_to_fetch, # Note: API doc says 'pair' for COIN-M, but for USD-M it's 'symbol'
    #     "period": "1d",
    #     "limit": days,
    #     "endTime": int(datetime.now().timestamp() * 1000),
    #     "startTime": int((datetime.now() - timedelta(days=days)).timestamp() * 1000)
    # }
    # # The endpoint is /futures/data/topLongShortPositionRatio.
    # # For USDⓈ-M Futures, the parameters are symbol, period, limit, startTime, endTime.
    # # For COIN-M Futures, the parameters are pair, period, limit, startTime, endTime.
    # # We are using BTCUSDT which is a USDⓈ-M future.
    # top_trader_ls_position_data = make_api_request("/futures/data/topLongShortPositionRatio", params_top_trader_ls_position)
    # if top_trader_ls_position_data:
    #     save_data_to_json(top_trader_ls_position_data, f"{symbol_to_fetch.lower()}_top_trader_long_short_position_ratio_1d.json")


    print("\nAll participant data collection tasks finished.") 