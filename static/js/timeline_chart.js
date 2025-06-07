async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Could not fetch data from ${url}:`, error);
        return null;
    }
}

async function initChart() {
    const klineDataUrl = '../../data/btcusdt_kline_1d.json';
    const eventsDataUrl = '../../data/market_events_cryptocompare.json';

    const klineData = await fetchData(klineDataUrl);
    const eventsData = await fetchData(eventsDataUrl);

    const chartCanvas = document.getElementById('priceEventsChart');
    const chartParentContainer = chartCanvas ? chartCanvas.parentElement : null;
    const eventsDisplayDiv = document.getElementById('eventsDisplay');

    if (!klineData || !eventsData) {
        console.error("Failed to load kline or events data. Chart cannot be initialized.");
        if(chartParentContainer) chartParentContainer.innerHTML = "<p style='color:red; text-align:center;'>圖表數據加載失敗 (無法獲取必要的數據檔案)，請檢查瀏覽器控制台的錯誤訊息。</p>";
        if(eventsDisplayDiv) eventsDisplayDiv.innerHTML = "<p>數據加載失敗，無法顯示事件。</p>";
        return;
    }

    console.log("Raw K-line data sample (first 5 entries):", klineData.slice(0, 5));

    const labels = [];
    const closePrices = [];
    klineData.forEach((k, index) => {
        if (typeof k !== 'object' || k === null || k.open_time === undefined || k.close === undefined) {
            console.warn(`Skipping malformed k-line entry at index ${index}: Entry is not a valid object or lacks required fields. Value:`, k);
            return; // Skip this entry
        }

        const timestamp = k.open_time;
        const closePrice = parseFloat(k.close);

        if (timestamp === null || timestamp === undefined || isNaN(closePrice)) {
            console.warn(`Skipping invalid k-line data at index ${index}: Timestamp: ${timestamp}, Close Price: ${k.close}`);
            return; // Skip this entry
        }
        
        const dateObj = new Date(timestamp);
        if (isNaN(dateObj.getTime())) { // Check if dateObj is a valid Date
            console.warn(`Invalid timestamp at index ${index}: ${timestamp}. Skipping.`);
            return; // Skip this entry
        }
        labels.push(dateObj);
        closePrices.push(closePrice);
    });

    if (labels.length === 0) {
        console.warn("K-line data is empty or all entries were invalid after processing. Chart will be empty.");
        if(chartParentContainer) chartParentContainer.innerHTML = "<p style='color:orange; text-align:center;'>K線數據為空或處理後無有效數據點，圖表無法繪製。</p>";
        if(eventsDisplayDiv) eventsDisplayDiv.innerHTML = "<p>無K線數據可關聯事件。</p>";
        return;
    }
    
    console.log(`Processed ${labels.length} K-line data points successfully.`);
    console.log(`Loaded ${eventsData.length} events.`);

    const eventsByDate = {};
    for (const event of eventsData) {
        const eventDate = event.date; 
        if (!eventDate || typeof eventDate !== 'string') {
            // console.warn("Skipping event with invalid date:", event);
            continue;
        }
        if (!eventsByDate[eventDate]) {
            eventsByDate[eventDate] = [];
        }
        eventsByDate[eventDate].push(event);
    }
    console.log("Processed events by date. Sample (first 5 dates with events):");
    let eventSampleCount = 0;
    for (const dateKey in eventsByDate) {
        if (eventSampleCount < 5) {
            // console.log(dateKey, eventsByDate[dateKey]);
            eventSampleCount++;
        } else {
            break;
        }
    }

    let isEventDisplayLocked = false;
    let lockedDateStr = null;

    function updateEventsDisplayForDate(dateStr, chartInstance) {
        if (!eventsDisplayDiv) return;
        if (eventsByDate[dateStr] && eventsByDate[dateStr].length > 0) {
            let htmlContent = `<h4>${dateStr} 的事件:</h4><ul>`;
            eventsByDate[dateStr].forEach(ev => {
                htmlContent += `<li><a href="${ev.url}" target="_blank" title="${ev.description || ev.title}">${ev.title}</a> (來源: ${ev.source})</li>`;
            });
            htmlContent += '</ul>';
            eventsDisplayDiv.innerHTML = htmlContent;
        } else {
            eventsDisplayDiv.innerHTML = `<p>日期 ${dateStr} 沒有記錄的相關事件。</p>`;
        }
    }
    
    // Initialize with default message considering lock state
    if (eventsDisplayDiv) {
        eventsDisplayDiv.innerHTML = '<p>將滑鼠懸停在圖表上的數據點以查看相關事件。點擊圖表上的點可鎖定/解鎖當日事件列表。</p>';
    }

    const ctx = chartCanvas.getContext('2d');
    const priceEventsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'BTC/USDT 收盤價',
                data: closePrices,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1,
                pointRadius: 3, 
                pointHoverRadius: 6,
                pointHitRadius: 10, 
                pointBackgroundColor: function(context) {
                    if (!context.chart.data.labels || context.chart.data.labels.length === 0 || !context.chart.data.labels[context.dataIndex]) return 'rgba(75, 192, 192, 1)';
                    const dateLabel = context.chart.data.labels[context.dataIndex];
                    if (!(dateLabel instanceof Date) || isNaN(dateLabel.getTime())) return 'rgba(75, 192, 192, 1)';
                    const dateStr = dateLabel.toISOString().split('T')[0];
                    return eventsByDate[dateStr] && eventsByDate[dateStr].length > 0 ? 'rgba(255, 99, 132, 1)' : 'rgba(75, 192, 192, 1)';
                },
                 pointBorderColor: function(context) {
                    if (!context.chart.data.labels || context.chart.data.labels.length === 0 || !context.chart.data.labels[context.dataIndex]) return 'rgba(75, 192, 192, 1)';
                    const dateLabel = context.chart.data.labels[context.dataIndex];
                    if (!(dateLabel instanceof Date) || isNaN(dateLabel.getTime())) return 'rgba(75, 192, 192, 1)';
                    const dateStr = dateLabel.toISOString().split('T')[0];
                    return eventsByDate[dateStr] && eventsByDate[dateStr].length > 0 ? 'rgba(255, 99, 132, 1)' : 'rgba(75, 192, 192, 1)';
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        tooltipFormat: 'yyyy-MM-dd',
                        displayFormats: {
                            day: 'MM-dd'
                        }
                    },
                    title: {
                        display: true,
                        text: '日期'
                    },
                    ticks: {
                        autoSkip: true,
                        maxTicksLimit: 20
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: '價格 (USDT)'
                    },
                    beginAtZero: false
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            if (tooltipItems.length > 0) {
                                const dateValue = new Date(tooltipItems[0].parsed.x);
                                if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
                                    return dateValue.toISOString().split('T')[0];
                                }
                            }
                            return '';
                        },
                        afterBody: function(tooltipItems) {
                            if (tooltipItems.length === 0 || !tooltipItems[0].parsed) return null;
                            const dateValue = new Date(tooltipItems[0].parsed.x);
                            if (!(dateValue instanceof Date) || isNaN(dateValue.getTime())) return null;
                            const dateStr = dateValue.toISOString().split('T')[0];
                            if (eventsByDate[dateStr] && eventsByDate[dateStr].length > 0) {
                                return `事件: ${eventsByDate[dateStr].length}`;
                            }
                            return null;
                        }
                    }
                }
            },
            onHover: (event, chartElements) => {
                if (isEventDisplayLocked) return; // Do nothing if display is locked

                if (eventsDisplayDiv) eventsDisplayDiv.innerHTML = '<p>將滑鼠懸停在圖表上的數據點以查看相關事件。點擊圖表上的點可鎖定/解鎖當日事件列表。</p>';
                if (chartElements.length > 0 && priceEventsChart.data.labels && priceEventsChart.data.labels.length > 0) {
                    const dataIndex = chartElements[0].index;
                    if (dataIndex >= 0 && dataIndex < priceEventsChart.data.labels.length) {
                        const dateValue = priceEventsChart.data.labels[dataIndex];
                        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
                            const dateStrHover = dateValue.toISOString().split('T')[0];
                            updateEventsDisplayForDate(dateStrHover, priceEventsChart); 
                        } else {
                             if (eventsDisplayDiv) eventsDisplayDiv.innerHTML = '<p>懸停處的日期數據無效。</p>';
                        }
                    } else {
                         if (eventsDisplayDiv) eventsDisplayDiv.innerHTML = '<p>懸停處的數據索引無效。</p>';
                    }
                } else if (chartElements.length > 0 && (!priceEventsChart.data.labels || priceEventsChart.data.labels.length === 0)){
                    if (eventsDisplayDiv) eventsDisplayDiv.innerHTML = '<p>圖表數據標籤為空，無法顯示事件。</p>';
                }
            },
            onClick: (event, chartElements) => {
                if (chartElements.length > 0 && priceEventsChart.data.labels && priceEventsChart.data.labels.length > 0) {
                    const dataIndex = chartElements[0].index;
                    if (dataIndex >= 0 && dataIndex < priceEventsChart.data.labels.length) {
                        const dateValue = priceEventsChart.data.labels[dataIndex];
                        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
                            const clickedDateStr = dateValue.toISOString().split('T')[0];
                            if (isEventDisplayLocked && lockedDateStr === clickedDateStr) {
                                // Unlock if clicking the same locked date
                                isEventDisplayLocked = false;
                                lockedDateStr = null;
                                if (eventsDisplayDiv) eventsDisplayDiv.innerHTML = '<p>事件列表已解鎖。將滑鼠懸停在圖表上的數據點以查看相關事件。</p>';
                                // Optionally, trigger a hover update if mouse is still over a point
                                // For simplicity, we'll let the next hover event handle it.
                            } else {
                                // Lock to this date
                                isEventDisplayLocked = true;
                                lockedDateStr = clickedDateStr;
                                updateEventsDisplayForDate(lockedDateStr, priceEventsChart);
                            }
                        }
                    }
                }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', initChart); 