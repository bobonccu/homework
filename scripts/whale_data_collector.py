import os
import san
import pandas as pd
from datetime import datetime, timedelta
import json

# --- Configuration ---
# Attempt to load API key from SANTIMENT_API_KEY if SANPY_APIKEY is not set
if not os.getenv('SANPY_APIKEY') and os.getenv('SANTIMENT_API_KEY'):
    san.ApiConfig.api_key = os.getenv('SANTIMENT_API_KEY')
    print("Using API key from SANTIMENT_API_KEY environment variable.")
elif os.getenv('SANPY_APIKEY'):
    print("Using API key from SANPY_APIKEY environment variable.")
else:
    print("Warning: No Santiment API key found in SANPY_APIKEY or SANTIMENT_API_KEY environment variables. Limited data access.")

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

SLUG = "bitcoin"
TO_DATE = datetime.now()
FROM_DATE = TO_DATE - timedelta(days=365) # Aim for 1 year, but free tier might limit this
INTERVAL = "1d"

PRICE_DATA_FILE = os.path.join(OUTPUT_DIR, 'btcusdt_kline_1d.json')
# Changed to exchange_balance as exchange_funds_flow seems deprecated
EXCHANGE_BALANCE_OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'btc_exchange_balance.json') 
TRANSACTION_VOLUME_OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'btc_transaction_volume.json')

# --- Helper function to fetch and save data ---
def fetch_and_save_metric(metric_name, output_file, slug, from_date, to_date, interval):
    """Fetches a given Santiment metric and saves it as JSON."""
    print(f"Fetching {metric_name} for {slug} from {from_date.strftime('%Y-%m-%d')} to {to_date.strftime('%Y-%m-%d')}...")
    try:
        data_df = san.get(
            metric_name,
            slug=slug,
            from_date=from_date.strftime('%Y-%m-%d'),
            to_date=to_date.strftime('%Y-%m-%d'),
            interval=interval
        )

        if data_df.empty:
            print(f"No data returned for {metric_name}. This might be due to API limitations or data availability.")
            return None

        data_df.index = data_df.index.strftime('%Y-%m-%d')
        
        # Rename columns for consistency if they are standard Santiment names
        if 'value' in data_df.columns and len(data_df.columns) == 1:
            data_df = data_df.rename(columns={'value': metric_name})
        elif metric_name == 'exchange_balance' and 'balance' in data_df.columns: # Hypothetical column name for exchange_balance
             data_df = data_df.rename(columns={'balance': metric_name})
        elif metric_name == 'transaction_volume' and 'transactionVolume' in data_df.columns:
            data_df = data_df.rename(columns={'transactionVolume': metric_name})
        # Add other specific renames if Santiment API returns different column names for other metrics
        
        # Ensure the main data column is named after the metric if it wasn't renamed yet
        # This is a fallback, ideally the above renames handle it.
        if len(data_df.columns) == 1 and data_df.columns[0] != metric_name:
            data_df = data_df.rename(columns={data_df.columns[0]: metric_name})
            
        records = data_df.reset_index().to_dict(orient='records')
        
        with open(output_file, 'w') as f:
            json.dump(records, f, indent=4)
        print(f"Successfully fetched and saved {metric_name} to {output_file}")
        return data_df

    except Exception as e:
        print(f"Error fetching {metric_name}: {e}")
        print("Please ensure you have a valid API key set as an environment variable (SANPY_APIKEY or SANTIMENT_API_KEY).")
        print("Free tier Santiment API has limitations on data range and access to certain metrics.")
        return None

# --- Main script execution ---
if __name__ == "__main__":
    print("Starting whale data collection...")

    # 1. Fetch Exchange Balance
    # This metric shows the total balance of Bitcoin on known exchange addresses.
    # An increase suggests more BTC held on exchanges (potential selling pressure or for trading).
    # A decrease suggests BTC moving off exchanges (potential HODLing or use in DeFi).
    fetch_and_save_metric(
        metric_name="exchange_balance", 
        output_file=EXCHANGE_BALANCE_OUTPUT_FILE,
        slug=SLUG,
        from_date=FROM_DATE,
        to_date=TO_DATE,
        interval=INTERVAL
    )

    # 2. Fetch Transaction Volume (On-chain)
    # This is the total amount of tokens transacted on the blockchain.
    # Large spikes can indicate whale activity.
    fetch_and_save_metric(
        metric_name="transaction_volume",
        output_file=TRANSACTION_VOLUME_OUTPUT_FILE,
        slug=SLUG,
        from_date=FROM_DATE,
        to_date=TO_DATE,
        interval=INTERVAL
    )

    print("Whale data collection finished.") 