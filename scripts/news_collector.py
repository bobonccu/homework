import os
import json
import requests
from datetime import datetime, timedelta
import time

# Configuration
NEWS_API_URL = "https://min-api.cryptocompare.com/data/v2/news/"
API_KEY = "ed9b7da992cab6381066ba331ea9f9dfa898d1095b3961edfd6fcadb31f0eec0"
DAYS_TO_FETCH_NEWS = 365 # Target: 1 year of news
# Attempt to get general Bitcoin related news, API might also have specific feeds parameter
NEWS_CATEGORIES = "BTC,CRYPTO,REGULATION,EXCHANGE" # Broader categories for better chance of relevant news
NEWS_FEEDS = "coindesk,cointelegraph,theblock,decrypt,bloombergcrypto,wsjcrypto" # Example if we want specific feeds, check API docs

MAJOR_EVENT_KEYWORDS = [
    "sec", "etf", "halving", "ban", "major", "launch", "crisis", "hack", 
    "regulation", "government", "partnership", "acquisition", "approval", 
    "lawsuit", "warning", "exploit", "crash", "rally", "record", "stablecoin",
    "cbdc", "adoption", "treasury", "fed", "senate", "congress"
]

OUTPUT_DIR_NEWS = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_FILE_NEWS = os.path.join(OUTPUT_DIR_NEWS, "market_events_cryptocompare.json")

# --- Helper function to manage API key (can be moved to a shared utility later) ---
def get_api_key():
    """
    Placeholder for potentially loading API key from .env in the future.
    For now, it returns the hardcoded key.
    """
    # TODO: Implement loading from .env file for better security
    # from dotenv import load_dotenv
    # load_dotenv()
    # key = os.getenv("CRYPTOCOMPARE_API_KEY")
    # if not key:
    #     print("Warning: CRYPTOCOMPARE_API_KEY not found in .env. Using hardcoded key.")
    #     return API_KEY # Fallback to hardcoded if not in .env for now
    return API_KEY

# --- Main data fetching logic ---
def fetch_news_batch(api_key_to_use, before_timestamp=None, categories=None, feeds=None, limit=50):
    """
    Fetches a single batch of news articles from the CryptoCompare API.
    Returns a list of news items or None if an error occurs.
    """
    params = {
        "api_key": api_key_to_use,
        "lang": "EN",      # Request English news
        "sortOrder": "latest", # Get latest news first when paginating backwards
        "limit": limit     # Number of articles per request (max might be 100, using 50 to be safe)
    }
    if before_timestamp:
        params["lTs"] = int(before_timestamp) # Unix timestamp to get news before this time
    if categories:
        params["categories"] = categories
    if feeds:
        params["feeds"] = feeds
    
    # print(f"Fetching news with params: {params}") # For debugging
    try:
        response = requests.get(NEWS_API_URL, params=params)
        response.raise_for_status() # Raise an exception for HTTP errors (4xx or 5xx)
        data = response.json()
        
        if data.get("Type") == 100 and "Data" in data: # Type 100 usually indicates success
            return data["Data"]
        elif data.get("Type") == 2 or data.get("Response") == "Error" and "Rate limit" in data.get("Message", ""):
            print(f"Rate limit hit or API error: {data.get('Message', 'Rate limit suspected')}")
            return "RATE_LIMIT_HIT" # Special return value for rate limiting
        else:
            print(f"API Error or unexpected response format: Type={data.get('Type')}, Message='{data.get('Message')}', Response='{data.get('Response')}'")
            # print(f"Full response: {data}") # For deeper debugging if needed
            return None
    except requests.exceptions.HTTPError as http_err:
        if http_err.response.status_code == 401: # Unauthorized - API key issue
            print(f"HTTP Error 401: Unauthorized. Check your API key. ({http_err})")
        elif http_err.response.status_code == 429: # Too Many Requests - Rate limit
            print(f"HTTP Error 429: Rate limit hit. ({http_err})")
            return "RATE_LIMIT_HIT"
        else:
            print(f"HTTP Request error: {http_err}")
        return None
    except requests.exceptions.RequestException as req_err:
        print(f"Request exception: {req_err}")
        return None
    except json.JSONDecodeError as json_err:
        print(f"JSON Decode error: {json_err} - Response text: {response.text if 'response' in locals() else 'N/A'}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred in fetch_news_batch: {e}")
        return None

def collect_all_news(api_key_to_use, days_to_fetch, categories_filter=None, feeds_filter=None, initial_sleep=0.5, page_sleep=1.2):
    """
    Collects news articles for the specified number of days, handling pagination.
    """
    all_collected_news = []
    # Target oldest timestamp (e.g., 365 days ago)
    oldest_timestamp_target = (datetime.utcnow() - timedelta(days=days_to_fetch)).timestamp()
    current_oldest_fetched_ts = datetime.utcnow().timestamp() # Start with now
    
    # For the very first request, we don't set 'lTs' to get the absolute latest news.
    # Subsequent requests will use the timestamp of the oldest news item from the previous batch.
    next_page_timestamp = None 

    print(f"Starting news collection. Target: {days_to_fetch} days back (until ~{datetime.fromtimestamp(oldest_timestamp_target).strftime('%Y-%m-%d')}).")
    time.sleep(initial_sleep) # Small initial delay

    max_api_calls = 100 # Safety break for API calls to avoid exhausting free tier quickly
    api_calls_count = 0

    while current_oldest_fetched_ts > oldest_timestamp_target and api_calls_count < max_api_calls:
        api_calls_count += 1
        print(f"API Call #{api_calls_count}. Fetching news before: {datetime.fromtimestamp(next_page_timestamp).strftime('%Y-%m-%d %H:%M:%S') if next_page_timestamp else 'Latest'}")
        
        news_batch = fetch_news_batch(api_key_to_use, before_timestamp=next_page_timestamp, categories=categories_filter, feeds=feeds_filter)

        if news_batch == "RATE_LIMIT_HIT":
            print("Rate limit hit. Waiting for 60 seconds before retrying or stopping...")
            time.sleep(60) # Wait a minute
            # Optionally, could implement more sophisticated backoff or stop here
            # For now, we'll try one more time after a delay, or just break if it persists
            news_batch = fetch_news_batch(api_key_to_use, before_timestamp=next_page_timestamp, categories=categories_filter, feeds=feeds_filter)
            if news_batch == "RATE_LIMIT_HIT" or news_batch is None:
                print("Rate limit persisted or error after retry. Stopping collection.")
                break
        
        if not news_batch:
            print("No news batch returned or error occurred. Halting further collection.")
            break

        batch_had_relevant_items = False
        for news_item in news_batch:
            published_on = news_item.get("published_on") # This is a Unix timestamp
            title = news_item.get("title")
            
            if not published_on or not title:
                continue # Skip items with missing critical data

            # Update the oldest timestamp we've seen so far from this batch
            current_oldest_fetched_ts = min(current_oldest_fetched_ts, published_on)

            if published_on < oldest_timestamp_target:
                # This news item (and subsequent ones in this sorted batch) are older than our target window
                # We can stop processing this batch and potentially stop all collection if this was the first item
                print(f"News item '{title}' from {datetime.fromtimestamp(published_on).strftime('%Y-%m-%d')} is older than target. Discarding rest of batch.")
                current_oldest_fetched_ts = published_on # Ensure outer loop condition updates
                batch_had_relevant_items = True # Mark that we at least saw an item to process the timestamp
                break # Stop processing this batch
            
            # Keyword filtering for major events
            title_lower = title.lower()
            is_major_event = False
            for keyword in MAJOR_EVENT_KEYWORDS:
                if keyword in title_lower:
                    is_major_event = True
                    break
            
            if not is_major_event:
                # print(f"Skipping (not major): {title}") # For debugging
                continue # Skip if no major event keywords found in title

            # Basic filtering (can be improved with more sophisticated NLP or keyword matching)
            # For now, if categories were used in API, assume relevance. Otherwise, check title for "Bitcoin" or "BTC"
            # This part might be redundant now due to keyword filtering, but keeping for now.
            is_relevant_topic = True # Assume relevant if categories and feeds used
            if not categories_filter and not feeds_filter: # If no categories/feeds specified, do a basic title check (less likely now)
                if "bitcoin" not in title_lower and "btc" not in title_lower:
                    is_relevant_topic = False
            
            if is_relevant_topic: # and is_major_event is already true
                event = {
                    "date": datetime.fromtimestamp(published_on).strftime('%Y-%m-%d'),
                    "title": title.strip(),
                    "description": news_item.get("body", "")[:300].strip() + "...", # Brief summary
                    "url": news_item.get("url", "#"),
                    "source": news_item.get("source_info", {}).get("name", "Unknown")
                }
                all_collected_news.append(event)
                batch_had_relevant_items = True
        
        if not batch_had_relevant_items and len(news_batch) > 0:
            print(f"Current batch from {datetime.fromtimestamp(news_batch[0].get('published_on',0)).strftime('%Y-%m-%d')} did not yield relevant items or all were too old.")
            # If the oldest item in this non-yielding batch is already older than our target, we can stop.
            if news_batch[-1].get("published_on", float('inf')) < oldest_timestamp_target:
                 print("Oldest item in non-yielding batch is past target date. Stopping.")
                 break

        if not news_batch: # Should have been caught earlier, but as a safeguard
            print("Breaking due to empty news_batch (safeguard).")
            break
            
        # Prepare for the next page: use the timestamp of the OLDEST article in the CURRENT batch
        next_page_timestamp = news_batch[-1].get("published_on")
        
        if not next_page_timestamp:
            print("Could not determine next page timestamp. Halting.")
            break
        
        print(f"Batch processed. {len(all_collected_news)} total events collected. Next fetch before {datetime.fromtimestamp(next_page_timestamp).strftime('%Y-%m-%d %H:%M:%S') if next_page_timestamp else 'N/A'}.")
        time.sleep(page_sleep) # Respect API rate limits

    if api_calls_count >= max_api_calls:
        print(f"Reached maximum API call limit ({max_api_calls}) for this run.")

    # Deduplicate (simple approach based on URL, can be improved)
    if all_collected_news:
        seen_urls = set()
        deduplicated_news = []
        for item in sorted(all_collected_news, key=lambda x: x["date"], reverse=True): # Process newer first for dedup
            if item["url"] not in seen_urls:
                deduplicated_news.append(item)
                seen_urls.add(item["url"])
        all_collected_news = sorted(deduplicated_news, key=lambda x: x["date"]) # Sort back by date
        print(f"Deduplicated news: {len(all_collected_news)} items.")

    return all_collected_news

def main():
    effective_api_key = get_api_key()
    if not effective_api_key or effective_api_key == "YOUR_CRYPTOCOMPARE_API_KEY": # Final check
        print("Critical Error: CryptoCompare API Key is not configured correctly.")
        return

    print(f"Starting news collection using API key ending with ...{effective_api_key[-6:]}")
    
    collected_events_data = collect_all_news(effective_api_key, DAYS_TO_FETCH_NEWS, categories_filter=NEWS_CATEGORIES, feeds_filter=NEWS_FEEDS)

    if collected_events_data:
        os.makedirs(OUTPUT_DIR_NEWS, exist_ok=True)
        try:
            with open(OUTPUT_FILE_NEWS, 'w', encoding='utf-8') as f:
                json.dump(collected_events_data, f, indent=4, ensure_ascii=False)
            print(f"Successfully collected {len(collected_events_data)} news events and saved to {OUTPUT_FILE_NEWS}")
            if collected_events_data:
                print(f"Sample - First event: {collected_events_data[0]['date']} - {collected_events_data[0]['title']}")
                print(f"Sample - Last event: {collected_events_data[-1]['date']} - {collected_events_data[-1]['title']}")
        except IOError as e:
            print(f"Error writing to file {OUTPUT_FILE_NEWS}: {e}")
        except Exception as e:
            print(f"An unexpected error occurred during file writing: {e}")
    else:
        print("No news events were collected, or an error prevented collection.")

if __name__ == "__main__":
    main() 