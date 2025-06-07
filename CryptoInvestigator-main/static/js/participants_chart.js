document.addEventListener('DOMContentLoaded', async () => {
    const DATA_FILES = {
        fundingRate: '../data/btcusdt_funding_rate.json',
        longShortRatio: '../data/btcusdt_long_short_ratio_1d.json',
        openInterest: '../data/btcusdt_open_interest_1d.json',
        klineData: '../data/btcusdt_kline_1d.json'
    };

    const BINANCE_GREEN = 'rgba(78, 186, 118, 0.5)'; // Adjusted for area fill
    const BINANCE_RED = 'rgba(239, 83, 80, 0.5)';   // Adjusted for area fill
    const BORDER_GREEN = 'rgb(78, 186, 118)';
    const BORDER_RED = 'rgb(239, 83, 80)';

    // --- Helper function to fetch data ---
    async function fetchData(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} for ${filePath}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching data from ${filePath}:`, error);
            // Display error on the page in a generic way if participant-charts exists
            const chartsDiv = document.getElementById('participant-charts');
            if (chartsDiv) {
                chartsDiv.innerHTML += `<p>Error loading data from ${filePath}. Check console for details.</p>`;
            }
            return null;
        }
    }

    // --- Helper function to prepare price data for charts ---
    function preparePriceData(klineData) {
        if (!klineData || klineData.length === 0) return [];
        return klineData.map(k => ({
            x: new Date(k.open_time),
            y: parseFloat(k.close)
        })).sort((a, b) => a.x - b.x);
    }

    // --- Helper function to filter price data to a specific date range ---
    function filterPriceDataToRange(fullPriceData, indicatorData, dateKey) {
        if (!indicatorData || indicatorData.length === 0 || !fullPriceData || fullPriceData.length === 0) {
            // console.warn('[filterPriceDataToRange] One of the data arrays is empty. indicatorData length:', indicatorData?.length, 'fullPriceData length:', fullPriceData?.length);
            return [];
        }
        // Ensure indicatorData is sorted by dateKey for correct min/max time
        const sortedIndicatorData = [...indicatorData].sort((a,b) => new Date(a[dateKey]) - new Date(b[dateKey]));
        
        const firstIndicatorDate = new Date(sortedIndicatorData[0][dateKey]);
        const lastIndicatorDate = new Date(sortedIndicatorData[sortedIndicatorData.length - 1][dateKey]);

        const indicatorMinTime = firstIndicatorDate.getTime();
        const indicatorMaxTime = lastIndicatorDate.getTime();

        // console.log(`[filterPriceDataToRange for ${dateKey}] Indicator Data Range:`);
        // console.log(`  Min Date: ${firstIndicatorDate.toISOString()} (${indicatorMinTime})`);
        // console.log(`  Max Date: ${lastIndicatorDate.toISOString()} (${indicatorMaxTime})`);
        // console.log(`  Total indicator points: ${sortedIndicatorData.length}`);

        // if (fullPriceData.length > 0) {
        //     const firstPriceDate = new Date(fullPriceData[0].x);
        //     const lastPriceDate = new Date(fullPriceData[fullPriceData.length - 1].x);
        //     console.log(`[filterPriceDataToRange for ${dateKey}] Full Price Data Range (before filtering):`);
        //     console.log(`  Min Date: ${firstPriceDate.toISOString()} (${firstPriceDate.getTime()})`);
        //     console.log(`  Max Date: ${lastPriceDate.toISOString()} (${lastPriceDate.getTime()})`);
        //     console.log(`  Total price points: ${fullPriceData.length}`);
        // }

        const filteredData = fullPriceData.filter(pricePoint => {
            const priceTime = pricePoint.x.getTime();
            return priceTime >= indicatorMinTime && priceTime <= indicatorMaxTime;
        });

        // console.log(`[filterPriceDataToRange for ${dateKey}] Filtered Price Data Points: ${filteredData.length}`);
        // if (filteredData.length > 0) {
        //     const firstFilteredDate = new Date(filteredData[0].x);
        //     const lastFilteredDate = new Date(filteredData[filteredData.length - 1].x);
        //     console.log(`  Filtered Min Date: ${firstFilteredDate.toISOString()}`);
        //     console.log(`  Filtered Max Date: ${lastFilteredDate.toISOString()}`);
        // } else if (fullPriceData.length > 0 && indicatorData.length > 0) {
        //     console.warn('[filterPriceDataToRange] No price data points matched the indicator range. This might indicate a timezone or date parsing mismatch.');
        // }
        return filteredData;
    }

    // --- Helper function to aggregate funding rate to daily (last rate of the day at UTC midnight) ---
    function aggregateFundingRateToDaily(fundingDataRaw) {
        if (!fundingDataRaw || fundingDataRaw.length === 0) return [];

        const dailyRates = {}; // Store the last rate for each day, keyed by YYYY-MM-DD

        // Ensure raw data is sorted by time to easily get the last rate if needed, though forEach covers all points
        const sortedFundingDataRaw = [...fundingDataRaw].sort((a, b) => new Date(a.fundingTime) - new Date(b.fundingTime));

        sortedFundingDataRaw.forEach(item => {
            const date = new Date(item.fundingTime);
            // Create a key for the day (e.g., "2023-10-26") by taking the date part of ISO string
            const dayKey = date.toISOString().split('T')[0];
            dailyRates[dayKey] = parseFloat(item.fundingRate); // This will overwrite earlier rates for the same day, effectively taking the last one due to sort
        });

        // Convert back to an array of objects suitable for the chart
        return Object.entries(dailyRates).map(([dayKey, rate]) => ({
            x: new Date(dayKey + 'T00:00:00.000Z'), // Date object at UTC midnight
            y: rate 
        })).sort((a, b) => a.x - b.x); // Sort by date again as object key order is not guaranteed
    }

    // --- Helper function: Split funding rate into positive/negative segments for correct coloring ---
    function splitFundingRateSegments(data) {
        if (!data || data.length === 0) return [];
        const segments = [];
        let currentSegment = [];
        let currentSign = Math.sign(data[0].y);

        for (let i = 0; i < data.length; i++) {
            const point = data[i];
            const sign = Math.sign(point.y);

            if (sign === 0) {
                // 0點視為分界，單獨一個點
                if (currentSegment.length > 0) segments.push({data: currentSegment, sign: currentSign});
                segments.push({data: [point], sign: 0});
                currentSegment = [];
                currentSign = 0;
            } else if (sign !== currentSign && currentSegment.length > 0) {
                // 跨越0軸，插入一個y=0的插值點
                const prev = data[i-1];
                // 線性插值找出交點
                const t = prev.y / (prev.y - point.y);
                const zeroX = prev.x instanceof Date && point.x instanceof Date
                    ? new Date(prev.x.getTime() + t * (point.x.getTime() - prev.x.getTime()))
                    : prev.x + t * (point.x - prev.x);
                const zeroPoint = {x: zeroX, y: 0};
                currentSegment.push(zeroPoint);
                segments.push({data: currentSegment, sign: currentSign});
                // 新段落從0點開始
                currentSegment = [zeroPoint, point];
                currentSign = sign;
            } else {
                currentSegment.push(point);
            }
        }
        if (currentSegment.length > 0) segments.push({data: currentSegment, sign: currentSign});
        return segments;
    }

    // --- Chart Rendering Functions ---

    function renderFundingRateChart(fundingData, priceData) {
        const chartElement = document.getElementById('fundingRateChart');
        if (!chartElement) {
            console.error('Canvas element for funding rate chart not found!');
            return;
        }
        const parentElement = chartElement.parentElement;
        if (!parentElement) {
            console.error('Parent element for funding rate chart canvas not found!');
            return;
        }
        if (!fundingData || fundingData.length === 0) {
            console.warn('No funding rate data to render.');
            parentElement.innerHTML += '<p>Funding rate data is currently unavailable.</p>';
            return;
        }
        
        // Prepare data for the funding rate segments
        const fundingSegments = splitFundingRateSegments(fundingData);
        const fundingDatasets = fundingSegments.map((seg, idx) => ({
            label: seg.sign > 0 ? 'Funding Rate (Positive)' : seg.sign < 0 ? 'Funding Rate (Negative)' : 'Funding Rate (Zero)',
            data: seg.data,
            yAxisID: 'yFundingRate',
            borderColor: seg.sign > 0 ? BORDER_GREEN : seg.sign < 0 ? BORDER_RED : 'rgba(200,200,200,0.7)',
            backgroundColor: seg.sign > 0 ? BINANCE_GREEN : seg.sign < 0 ? BINANCE_RED : 'rgba(200,200,200,0.1)',
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBorderWidth: 2,
            pointHitRadius: 10,
            borderWidth: 1.5,
            fill: true,
            tension: 0.1,
            order: 1,
        }));

        // BTC Price line dataset (unchanged)
        const priceDataset = {
            label: 'BTC Price (USDT)',
            data: priceData, // Assumed to be correctly filtered by caller
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            yAxisID: 'yPrice',
            tension: 0.1,
            pointRadius: 1,
            pointHitRadius: 10, // Keep for price line if needed for consistency, or remove if hover is good
            borderWidth: 1.5,
            order: 2,
        };

        const ctx = chartElement.getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    ...fundingDatasets,
                    priceDataset
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: true,
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            tooltipFormat: 'MMM dd, yyyy'
                        },
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    yFundingRate: {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Funding Rate'
                        },
                        ticks: {
                            callback: function(value) {
                                return (value * 100).toFixed(4) + '%';
                            }
                        }
                    },
                    yPrice: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'BTC Price (USDT)'
                        },
                        grid: {
                            drawOnChartArea: false, 
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            generateLabels: function(chart) {
                                const datasets = chart.data.datasets;
                                const legendItems = [];
                                // Only show one positive/negative legend
                                let hasPos = false, hasNeg = false;
                                datasets.forEach((ds, idx) => {
                                    if (ds.yAxisID === 'yFundingRate') {
                                        if (ds.borderColor === BORDER_GREEN && !hasPos) {
                                            legendItems.push({
                                                text: 'Positive Funding Rate',
                                                fillStyle: BINANCE_GREEN,
                                                strokeStyle: BORDER_GREEN,
                                                lineWidth: 1.5,
                                                hidden: !chart.isDatasetVisible(idx),
                                                datasetIndex: idx,
                                            });
                                            hasPos = true;
                                        } else if (ds.borderColor === BORDER_RED && !hasNeg) {
                                            legendItems.push({
                                                text: 'Negative Funding Rate',
                                                fillStyle: BINANCE_RED,
                                                strokeStyle: BORDER_RED,
                                                lineWidth: 1.5,
                                                hidden: !chart.isDatasetVisible(idx),
                                                datasetIndex: idx,
                                            });
                                            hasNeg = true;
                                        }
                                    }
                                });
                                // BTC Price
                                datasets.forEach((ds, idx) => {
                                    if (ds.yAxisID === 'yPrice') {
                                        legendItems.push({
                                            text: ds.label,
                                            fillStyle: ds.backgroundColor,
                                            strokeStyle: ds.borderColor,
                                            lineWidth: ds.borderWidth || 1.5,
                                            hidden: !chart.isDatasetVisible(idx),
                                            datasetIndex: idx
                                        });
                                    }
                                });
                                return legendItems;
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let datasetLabel = context.dataset.label || ''; 
                                let valueText = '';

                                if (context.parsed.y !== null) {
                                    if (context.dataset.yAxisID === 'yFundingRate') {
                                        datasetLabel = 'Funding Rate'; // Standardize label in tooltip
                                        valueText = (context.parsed.y * 100).toFixed(4) + '%';
                                    } else if (context.dataset.yAxisID === 'yPrice') {
                                        // datasetLabel remains context.dataset.label which is 'BTC Price (USDT)'
                                        valueText = '$' + context.parsed.y.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    } else {
                                        valueText = context.parsed.y.toString();
                                    }
                                }
                                return datasetLabel + ': ' + valueText;
                            },
                            labelColor: function(context) {
                                if (context.dataset.yAxisID === 'yFundingRate') {
                                    const borderColor = context.dataset.borderColor; // Get the actual border color
                                    if (borderColor === BORDER_GREEN) {
                                        return {
                                            borderColor: BORDER_GREEN,
                                            backgroundColor: BINANCE_GREEN
                                        };
                                    } else if (borderColor === BORDER_RED) {
                                        return {
                                            borderColor: BORDER_RED,
                                            backgroundColor: BINANCE_RED
                                        };
                                    } else { // Handles a neutral/zero color, e.g., grey
                                        return {
                                            borderColor: 'rgba(200,200,200,0.7)', // Match the zero segment's border
                                            backgroundColor: 'rgba(200,200,200,0.1)' // Match the zero segment's background
                                        };
                                    }
                                }
                                // For other datasets, use their own borderColor/backgroundColor
                                let borderColor = context.dataset.borderColor;
                                let backgroundColor = context.dataset.backgroundColor;
                                if (Array.isArray(borderColor)) {
                                    borderColor = borderColor[context.dataIndex] || 'rgba(0,0,0,0.1)';
                                }
                                if (Array.isArray(backgroundColor)) {
                                    backgroundColor = backgroundColor[context.dataIndex] || 'rgba(0,0,0,0.1)';
                                }
                                return {
                                    borderColor: borderColor || 'rgba(0,0,0,0.1)',
                                    backgroundColor: backgroundColor || 'rgba(0,0,0,0.1)'
                                };
                            },
                            filter: function(tooltipItem, currentIndex, allTooltipItems, chart) {
                                const currentDataset = chart.data.datasets[tooltipItem.datasetIndex];
                                const currentParsedY = tooltipItem.parsed.y;
                                const isCurrentItemZeroFundingRate = currentDataset && currentDataset.yAxisID === 'yFundingRate' && currentParsedY === 0;

                                if (isCurrentItemZeroFundingRate) {
                                    // Check if there's already another zero funding rate item *before* this one
                                    for (let i = 0; i < currentIndex; i++) {
                                        const priorItem = allTooltipItems[i];
                                        if (priorItem && chart.data.datasets[priorItem.datasetIndex]) {
                                            const priorDataset = chart.data.datasets[priorItem.datasetIndex];
                                            if (priorDataset && priorDataset.yAxisID === 'yFundingRate' && priorItem.parsed && priorItem.parsed.y === 0) {
                                                return false; // Filter out this current item as a duplicate zero
                                            }
                                        }
                                    }
                                }
                                return true; // Keep the item
                            }
                        }
                    }
                }
            }
        });
    }

    function renderLongShortRatioChart(lsData, priceData) {
        const chartElement = document.getElementById('longShortRatioChart');
        if (!chartElement) {
            console.error('Canvas element for long short chart not found!');
            return;
        }
        const parentElement = chartElement.parentElement;
        if (!parentElement) {
            console.error('Parent element for long short chart canvas not found!');
            return;
        }
        if (!lsData || lsData.length === 0) {
            console.warn('No long/short ratio data to render.');
            parentElement.innerHTML += '<p>Long/short ratio data is currently unavailable.</p>';
            return;
        }
        const ctx = chartElement.getContext('2d');
        const lsMinTime = new Date(lsData[0].timestamp);
        const lsMaxTime = new Date(lsData[lsData.length - 1].timestamp);

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: lsData.map(item => new Date(item.timestamp)),
                datasets: [{
                    label: 'Long/Short Ratio',
                    data: lsData.map(item => parseFloat(item.longShortRatio)),
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.3)',
                    yAxisID: 'yLsRatio',
                    tension: 0.1,
                    pointRadius: 0,
                    borderWidth: 1,
                    fill: true
                },
                {
                    label: 'BTC Price (USDT)',
                    data: priceData,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    yAxisID: 'yPrice',
                    tension: 0.1,
                    pointRadius: 1,
                    borderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false,
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'MMM dd, yyyy'
                        },
                        title: {
                            display: true,
                            text: 'Date'
                        },
                        min: lsMinTime,
                        max: lsMaxTime
                    },
                    yLsRatio: {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Long/Short Ratio'
                        }
                    },
                    yPrice: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'BTC Price (USDT)'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    if (context.dataset.yAxisID === 'yPrice') {
                                        label += '$' + context.parsed.y.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    } else {
                                        label += context.parsed.y.toFixed(4);
                                    }
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderOpenInterestChart(oiData, priceData) {
        const chartElement = document.getElementById('openInterestChart');
        if (!chartElement) {
            console.error('Canvas element for open interest chart not found!');
            return;
        }
        const parentElement = chartElement.parentElement;
        if (!parentElement) {
            console.error('Parent element for open interest chart canvas not found!');
            return;
        }
        if (!oiData || oiData.length === 0) {
            console.warn('No open interest data to render.');
            parentElement.innerHTML += '<p>Open interest data is currently unavailable.</p>';
            return;
        }
        const ctx = chartElement.getContext('2d');
        const oiMinTime = new Date(oiData[0].timestamp);
        const oiMaxTime = new Date(oiData[oiData.length - 1].timestamp);

        new Chart(ctx, {
            data: {
                labels: oiData.map(item => new Date(item.timestamp)),
                datasets: [{
                    type: 'bar',
                    label: 'Open Interest (BTC)',
                    data: oiData.map(item => parseFloat(item.sumOpenInterest)),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    yAxisID: 'yOpenInterestBTC',
                    borderWidth: 1
                },
                {
                    type: 'line',
                    label: 'Open Interest Value (USDT)',
                    data: oiData.map(item => parseFloat(item.sumOpenInterestValue)),
                    borderColor: 'rgb(255, 159, 64)',
                    backgroundColor: 'rgba(255, 159, 64, 0.5)',
                    yAxisID: 'yOpenInterestUSDT',
                    tension: 0.1,
                    pointRadius: 0,
                    borderWidth: 1,
                    fill: true
                },
                {
                    type: 'line',
                    label: 'BTC Price (USDT)',
                    data: priceData,
                    borderColor: 'rgb(153, 102, 255)',
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    yAxisID: 'yPrice',
                    tension: 0.1,
                    pointRadius: 1,
                    borderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false,
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'MMM dd, yyyy'
                        },
                        title: {
                            display: true,
                            text: 'Date'
                        },
                        min: oiMinTime,
                        max: oiMaxTime
                    },
                    yOpenInterestBTC: {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Open Interest (BTC)'
                        },
                        beginAtZero: false
                    },
                    yOpenInterestUSDT: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Open Interest Value (USDT)'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
                                if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
                                if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K';
                                return value.toLocaleString();
                            }
                        }
                    },
                    yPrice: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'BTC Price (USDT)'
                        },
                        grid: {
                            drawOnChartArea: false, 
                        },
                        offset: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    if (context.dataset.yAxisID === 'yPrice') {
                                        label += '$' + context.parsed.y.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    } else if (context.dataset.label === 'Open Interest Value (USDT)') {
                                         if (context.parsed.y >= 1e9) label += (context.parsed.y / 1e9).toFixed(2) + 'B USDT';
                                         else if (context.parsed.y >= 1e6) label += (context.parsed.y / 1e6).toFixed(2) + 'M USDT';
                                         else if (context.parsed.y >= 1e3) label += (context.parsed.y / 1e3).toFixed(2) + 'K USDT';
                                         else label += context.parsed.y.toLocaleString() + ' USDT';
                                    } else {
                                        label += context.parsed.y.toLocaleString() + ' BTC';
                                    }
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    // --- Load all data and render charts ---
    console.log("Fetching all data...");
    const klineDataRaw = await fetchData(DATA_FILES.klineData);
    const fundingRateDataRaw = await fetchData(DATA_FILES.fundingRate);
    const longShortRatioDataRaw = await fetchData(DATA_FILES.longShortRatio);
    const openInterestDataRaw = await fetchData(DATA_FILES.openInterest);

    const fullPriceChartData = preparePriceData(klineDataRaw);

    const sortedFundingRateDataRaw = fundingRateDataRaw ? fundingRateDataRaw.sort((a,b) => new Date(a.fundingTime) - new Date(b.fundingTime)) : [];
    const dailyFundingChartData = aggregateFundingRateToDaily(fundingRateDataRaw || []);

    const sortedLsRatioData = longShortRatioDataRaw ? longShortRatioDataRaw.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];
    const sortedOiData = openInterestDataRaw ? openInterestDataRaw.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];

    if (dailyFundingChartData.length > 0) {
        const priceDataForFundingRate = filterPriceDataToRange(fullPriceChartData, dailyFundingChartData, 'x');
        renderFundingRateChart(dailyFundingChartData, priceDataForFundingRate);
    }
    if (sortedLsRatioData.length > 0) {
        const priceDataForLs = filterPriceDataToRange(fullPriceChartData, sortedLsRatioData, 'timestamp');
        renderLongShortRatioChart(sortedLsRatioData, priceDataForLs);
    }
    if (sortedOiData.length > 0) {
        const priceDataForOi = filterPriceDataToRange(fullPriceChartData, sortedOiData, 'timestamp');
        renderOpenInterestChart(sortedOiData, priceDataForOi);
    }
    console.log("All charts should be rendered.");
}); 