import os
import json
import requests
from datetime import datetime, timedelta
import time

# Configuration
SYMBOL = "BTCUSDT"
INTERVAL = "1d"  # 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
# Binance API Klines endpoint limit per request
LIMIT = 1000 
# Data to fetch (e.g., 1 year)
DAYS_TO_FETCH = 365

# Output directory and file
# The script is in 'scripts/', so OUTPUT_DIR is '../data/'
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, f"{SYMBOL.lower()}_kline_{INTERVAL}.json")

BINANCE_API_URL = "https://api.binance.com/api/v3/klines"

def fetch_klines(symbol, interval, start_time_ms, end_time_ms, limit):
    """
    Fetches K-line/candlestick data from Binance.
    Binance API returns data in batches. We might need multiple calls if the date range is large.
    """
    all_klines = []
    current_start_time = start_time_ms

    print(f"Fetching K-lines for {symbol} with interval {interval}")
    print(f"From: {datetime.fromtimestamp(start_time_ms/1000)} To: {datetime.fromtimestamp(end_time_ms/1000)}")

    while current_start_time < end_time_ms:
        params = {
            "symbol": symbol,
            "interval": interval,
            "startTime": int(current_start_time),
            "endTime": int(end_time_ms), # endTime is inclusive
            "limit": limit 
        }
        
        try:
            response = requests.get(BINANCE_API_URL, params=params)
            response.raise_for_status()  # Raise an exception for HTTP errors
            klines = response.json()

            if not klines:
                # No more data for the period or an issue
                print(f"No more klines received at {datetime.fromtimestamp(current_start_time/1000)}. Breaking loop.")
                break

            all_klines.extend(klines)
            
            # Binance returns Klines with the open time as the first element.
            # The next query should start after the last Kline's open time.
            # Add 1 to avoid fetching the same kline again if interval matches exactly
            last_kline_open_time = klines[-1][0]
            current_start_time = last_kline_open_time + 1 
            
            print(f"Fetched {len(klines)} klines. Last kline open time: {datetime.fromtimestamp(last_kline_open_time/1000)}. Next start: {datetime.fromtimestamp(current_start_time/1000)}")

            # Respect Binance API rate limits - a small delay between requests
            time.sleep(0.2) # 200ms delay

        except requests.exceptions.RequestException as e:
            print(f"HTTP Request error: {e}")
            return None # Or handle more gracefully
        except json.JSONDecodeError as e:
            print(f"JSON Decode error: {e} - Response: {response.text}")
            return None
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return None
            
    return all_klines

def process_klines(klines_data):
    """
    Processes raw K-line data into a more readable format.
    Each kline is: [open_time, open, high, low, close, volume, close_time, quote_asset_volume, number_of_trades, taker_buy_base_asset_volume, taker_buy_quote_asset_volume, ignore]
    """
    processed = []
    if not klines_data:
        return processed
        
    for kline in klines_data:
        processed.append({
            "open_time": kline[0],
            "open_time_readable": datetime.fromtimestamp(kline[0]/1000).strftime('%Y-%m-%d %H:%M:%S'),
            "open": float(kline[1]),
            "high": float(kline[2]),
            "low": float(kline[3]),
            "close": float(kline[4]),
            "volume": float(kline[5]),
            "close_time": kline[6],
            "close_time_readable": datetime.fromtimestamp(kline[6]/1000).strftime('%Y-%m-%d %H:%M:%S'),
            "quote_asset_volume": float(kline[7]),
            "number_of_trades": int(kline[8]),
            "taker_buy_base_asset_volume": float(kline[9]),
            "taker_buy_quote_asset_volume": float(kline[10])
        })
    # Sort by open time just in case, though Binance usually returns them sorted.
    processed.sort(key=lambda x: x['open_time'])
    return processed

def main():
    # Calculate start and end times
    end_datetime = datetime.utcnow()
    start_datetime = end_datetime - timedelta(days=DAYS_TO_FETCH)
    
    # Binance API expects milliseconds
    start_time_ms = int(start_datetime.timestamp() * 1000)
    end_time_ms = int(end_datetime.timestamp() * 1000)

    raw_klines = fetch_klines(SYMBOL, INTERVAL, start_time_ms, end_time_ms, LIMIT)

    if raw_klines is not None:
        processed_data = process_klines(raw_klines)
        
        if processed_data:
            # Ensure output directory exists
            os.makedirs(OUTPUT_DIR, exist_ok=True)
            
            with open(OUTPUT_FILE, 'w') as f:
                json.dump(processed_data, f, indent=4)
            
            print(f"Successfully fetched and saved {len(processed_data)} klines to {OUTPUT_FILE}")
            if processed_data:
                 print(f"First kline: {processed_data[0]['open_time_readable']} - Last kline: {processed_data[-1]['open_time_readable']}")
        else:
            print("No data processed or saved.")
    else:
        print("Failed to fetch K-line data.")

if __name__ == "__main__":
    main() 