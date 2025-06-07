import json
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
import os

# Get the directory of the current script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Construct the path to the data directory (assuming it's ../data/ relative to the script)
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "data")
# Construct the full path to the BTC kline file
BTC_KLINE_FILE = os.path.join(DATA_DIR, "btcusdt_kline_1d.json")
OUTPUT_FILE = os.path.join(DATA_DIR, "volatility_comparison.json")

ROLLING_WINDOW = 30

def load_btc_data(file_path):
    """Loads BTC kline data from a JSON file."""
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
        df = pd.DataFrame(data)
        df['date'] = pd.to_datetime(df['open_time'], unit='ms')
        df.set_index('date', inplace=True)
        df['close'] = df['close'].astype(float)
        return df[['close']]
    except FileNotFoundError:
        print(f"Error: BTC data file not found at {file_path}")
        return None
    except Exception as e:
        print(f"Error loading BTC data: {e}")
        return None

def fetch_spy_data(start_date_str, end_date_str):
    """Fetches SPY daily data from Yahoo Finance."""
    try:
        spy = yf.Ticker("SPY")
        # Adding a buffer for rolling calculation
        start_date_dt = datetime.strptime(start_date_str, '%Y-%m-%d') - timedelta(days=ROLLING_WINDOW + 10) # Increased buffer slightly for correlation
        
        df_spy = spy.history(start=start_date_dt.strftime('%Y-%m-%d'), end=end_date_str, interval="1d")
        df_spy.index = pd.to_datetime(df_spy.index.date) # Normalize index to date (remove time part)
        return df_spy[['Close']].rename(columns={'Close': 'close'})
    except Exception as e:
        print(f"Error fetching SPY data: {e}")
        return None

def calculate_daily_returns(df):
    """Calculates daily returns."""
    if df is None or 'close' not in df.columns:
        return None
    df_returns = df.copy()
    df_returns['daily_return'] = df_returns['close'].pct_change()
    return df_returns[['daily_return']].dropna()

def calculate_volatility(df_returns, window=ROLLING_WINDOW):
    """Calculates rolling volatility from daily returns."""
    if df_returns is None or 'daily_return' not in df_returns.columns:
        return None
    df_vol = df_returns.copy()
    df_vol['volatility'] = df_vol['daily_return'].rolling(window=window).std() * (365**0.5) # Annualized volatility
    return df_vol[['volatility']].dropna()

def calculate_rolling_correlation(df_returns1, df_returns2, window=ROLLING_WINDOW):
    """Calculates rolling correlation between two series of daily returns."""
    if df_returns1 is None or df_returns2 is None or \
       'daily_return' not in df_returns1.columns or 'daily_return' not in df_returns2.columns:
        return pd.DataFrame(columns=['correlation']) # Ensure 'correlation' column exists
    
    merged_returns = pd.merge(df_returns1, df_returns2, left_index=True, right_index=True, suffixes=('_1', '_2'), how='inner')
    
    if merged_returns.empty or 'daily_return_1' not in merged_returns or 'daily_return_2' not in merged_returns or len(merged_returns) < window:
        print("Warning: Not enough overlapping data or window too small for rolling correlation.")
        return pd.DataFrame(columns=['correlation']) # Ensure 'correlation' column exists
        
    rolling_corr_series = merged_returns['daily_return_1'].rolling(window=window).corr(merged_returns['daily_return_2'])
    
    df_corr = pd.DataFrame(rolling_corr_series) # Column name likely 'daily_return_1' here
    
    if not df_corr.empty:
        df_corr.columns = ['correlation'] # Directly assign the correct column name
        df_corr = df_corr.dropna() # Drop NaNs after naming
    else:
        # If df_corr is empty (e.g., all NaNs from series, or series was empty)
        # ensure it has the 'correlation' column.
        df_corr = pd.DataFrame(columns=['correlation'])
    
    return df_corr

def main():
    """Main function to process data and save output."""
    df_btc_raw = load_btc_data(BTC_KLINE_FILE)
    if df_btc_raw is None:
        return

    if df_btc_raw.index.min() is pd.NaT or df_btc_raw.index.max() is pd.NaT:
        print("Error: BTC data has invalid date index.")
        return
        
    btc_min_date_for_spy = df_btc_raw.index.min() - timedelta(days=ROLLING_WINDOW + 10) # Adjusted buffer
    start_date_str = btc_min_date_for_spy.strftime('%Y-%m-%d')
    end_date_str = (df_btc_raw.index.max() + timedelta(days=1)).strftime('%Y-%m-%d')

    df_spy_raw = fetch_spy_data(start_date_str, end_date_str)
    if df_spy_raw is None:
        return

    # Calculate daily returns first
    df_btc_returns = calculate_daily_returns(df_btc_raw.copy())
    df_spy_returns = calculate_daily_returns(df_spy_raw.copy())

    if df_btc_returns is None or df_spy_returns is None:
        print("Error calculating daily returns for BTC or SPY.")
        return

    # Calculate volatility from returns
    df_btc_vol = calculate_volatility(df_btc_returns.copy())
    df_spy_vol = calculate_volatility(df_spy_returns.copy())

    if df_btc_vol is None or df_spy_vol is None:
        print("Error calculating volatility for BTC or SPY.")
        return

    # Calculate rolling correlation from returns
    df_correlation = calculate_rolling_correlation(df_btc_returns, df_spy_returns)
    if df_correlation is None:
        print("Error calculating rolling correlation.")
        # We might want to proceed without correlation if it fails, or stop. For now, let's stop.
        return

    # Merge volatility data
    df_merged_vol = pd.merge(df_btc_vol, df_spy_vol, left_index=True, right_index=True, how='inner', suffixes=['_btc', '_spy'])
    
    # Merge correlation data with volatility data
    # Both df_merged_vol and df_correlation are indexed by date
    df_merged_all = pd.merge(df_merged_vol, df_correlation, left_index=True, right_index=True, how='inner')
    
    # Filter out any dates that might be too early due to the rolling window buffer
    # Use the start date of the merged volatility data, as it already considers the rolling window.
    # Or, more robustly, use the latest start date among all components.
    # For simplicity, we'll ensure all components (vol, corr) are aligned.
    # The inner merge already handles alignment. Let's ensure we filter from BTC's usable data start.
    
    # The common_start_date should ideally be derived from the final merged data
    # or the latest of the minimum dates of all components.
    # df_btc_vol.index.min() is a good reference.
    if not df_merged_all.empty and not df_btc_vol.empty: # Check df_btc_vol for common_start_date
       common_start_date = df_btc_vol.index.min() # Start date for volatility
       # Correlation might start slightly later due to its own rolling window on returns.
       # The inner merge already takes the intersection of dates.
       # Let's use the df_merged_all's own min index if it's later.
       if not df_merged_all.index.min() < common_start_date:
           common_start_date = df_merged_all.index.min()

       df_merged_all = df_merged_all[df_merged_all.index >= common_start_date]


    output_data = []
    for date, row in df_merged_all.iterrows():
        output_data.append({
            "date": date.strftime('%Y-%m-%d'),
            "btc_volatility": row['volatility_btc'],
            "spy_volatility": row['volatility_spy'],
            "btc_spy_correlation": row['correlation'] # Added correlation
        })
    
    output_data.sort(key=lambda x: x['date'])

    try:
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(output_data, f, indent=4)
        print(f"Successfully saved volatility and correlation data to {OUTPUT_FILE}")
    except Exception as e:
        print(f"Error saving output file: {e}")

if __name__ == "__main__":
    main() 