document.addEventListener('DOMContentLoaded', async () => {
    const DATA_FILES = {
        exchangeBalance: '../data/btc_exchange_balance.json',
        transactionVolume: '../data/btc_transaction_volume.json',
        klineData: '../data/btcusdt_kline_1d.json' // For price overlay
    };

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
            // Display error on the page in a generic way if whale-retail-charts exists
            const chartsDiv = document.getElementById('whale-retail-charts');
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

    // --- Helper function to filter price data to a specific date range of an indicator ---
    function filterPriceDataToIndicatorRange(fullPriceData, indicatorData) {
        if (!indicatorData || indicatorData.length === 0 || !fullPriceData || fullPriceData.length === 0) {
            return [];
        }
        // Assuming indicatorData is an array of objects with a 'datetime' or 'index' property for the date
        const indicatorDates = indicatorData.map(item => new Date(item.datetime || item.index)).sort((a,b) => a - b);
        if (indicatorDates.length === 0) return [];

        const indicatorMinTime = indicatorDates[0].getTime();
        const indicatorMaxTime = indicatorDates[indicatorDates.length - 1].getTime();

        return fullPriceData.filter(pricePoint => {
            const priceTime = pricePoint.x.getTime();
            return priceTime >= indicatorMinTime && priceTime <= indicatorMaxTime;
        });
    }

    // --- Chart Rendering Functions (to be implemented) ---
    function renderExchangeBalanceChart(balanceData, priceData) {
        const chartElement = document.getElementById('exchangeNetflowChart'); // Note: HTML ID is exchangeNetflowChart
        if (!chartElement) {
            console.error('Canvas element for exchange balance chart not found!');
            return;
        }
        const parentElement = chartElement.parentElement;
        if (!parentElement || !parentElement.parentElement) { // chart-container -> chart-section
            console.error('Parent element for exchange balance chart canvas not found!');
            return;
        }
        if (!balanceData || balanceData.length === 0) {
            console.warn('No exchange balance data to render.');
            // Add message to the specific chart's data-description div
            const descriptionDiv = parentElement.nextElementSibling; // Assuming data-description is the next sibling of chart-container
            if (descriptionDiv && descriptionDiv.classList.contains('data-description')) {
                descriptionDiv.innerHTML += '<p>交易所餘額數據目前無法取得。</p>';
            } else {
                 parentElement.parentElement.innerHTML += '<p>交易所餘額數據目前無法取得。</p>';
            }
            return;
        }

        const labels = balanceData.map(item => new Date(item.datetime || item.index));
        const balanceValues = balanceData.map(item => parseFloat(item.exchange_balance));

        const ctx = chartElement.getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'BTC Exchange Balance',
                        data: balanceValues,
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        yAxisID: 'yBalance',
                        tension: 0.1,
                        fill: true
                    },
                    {
                        label: 'BTC Price (USDT)',
                        data: priceData, // Filtered price data
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        yAxisID: 'yPrice',
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        type: 'time',
                        time: { tooltipFormat: 'MMM dd, yyyy' },
                        title: { display: true, text: '日期' }
                    },
                    yBalance: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: 'BTC Exchange Balance' },
                        ticks: { callback: value => value.toLocaleString() }
                    },
                    yPrice: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: 'BTC Price (USDT)' },
                        grid: { drawOnChartArea: false }, // Only show grid for left axis
                        ticks: { callback: value => '$' + value.toLocaleString() }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) {
                                    if (context.dataset.yAxisID === 'yPrice') {
                                        label += '$' + context.parsed.y.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    } else {
                                        label += context.parsed.y.toLocaleString();
                                    }
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
        console.log("Exchange Balance chart rendered with price overlay.");
    }

    function renderTransactionVolumeChart(volumeData, priceData) {
        const chartElement = document.getElementById('largeTransactionsChart');
        if (!chartElement) {
            console.error('Canvas element for transaction volume chart not found!');
            return;
        }
         const parentElement = chartElement.parentElement;
        if (!parentElement || !parentElement.parentElement) { // chart-container -> chart-section
            console.error('Parent element for transaction volume chart canvas not found!');
            return;
        }
        if (!volumeData || volumeData.length === 0) {
            console.warn('No transaction volume data to render.');
            const descriptionDiv = parentElement.nextElementSibling; 
            if (descriptionDiv && descriptionDiv.classList.contains('data-description')) {
                descriptionDiv.innerHTML += '<p>鏈上交易量數據目前無法取得。</p>';
            } else {
                parentElement.parentElement.innerHTML += '<p>鏈上交易量數據目前無法取得。</p>';
            }
            return;
        }

        const labels = volumeData.map(item => new Date(item.datetime || item.index));
        const volumeValues = volumeData.map(item => parseFloat(item.transaction_volume));

        const ctx = chartElement.getContext('2d');
        new Chart(ctx, {
            type: 'bar', // Bar chart might be good for volume
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'BTC Transaction Volume',
                        data: volumeValues,
                        backgroundColor: 'rgba(75, 192, 192, 0.5)',
                        borderColor: 'rgb(75, 192, 192)',
                        yAxisID: 'yVolume',
                        order: 1
                    },
                    {
                        type: 'line', // Overlay price as a line
                        label: 'BTC Price (USDT)',
                        data: priceData, // Filtered price data
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        yAxisID: 'yPrice',
                        tension: 0.1,
                        order: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        type: 'time',
                        time: { tooltipFormat: 'MMM dd, yyyy' },
                        title: { display: true, text: '日期' }
                    },
                    yVolume: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: 'BTC Transaction Volume' },
                        ticks: { callback: value => value.toLocaleString() }
                    },
                    yPrice: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: 'BTC Price (USDT)' },
                        grid: { drawOnChartArea: false },
                        ticks: { callback: value => '$' + value.toLocaleString() }
                    }
                },
                plugins: {
                     tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) {
                                    if (context.dataset.yAxisID === 'yPrice') {
                                        label += '$' + context.parsed.y.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    } else {
                                        label += context.parsed.y.toLocaleString();
                                    }
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
        console.log("Transaction Volume chart rendered with price overlay.");
    }

    // --- Load all data and render charts ---
    console.log("Fetching all data for whale/retail sentiment charts...");
    const exchangeBalanceData = await fetchData(DATA_FILES.exchangeBalance);
    const transactionVolumeData = await fetchData(DATA_FILES.transactionVolume);
    const klineDataRaw = await fetchData(DATA_FILES.klineData);
    
    const fullPriceChartData = preparePriceData(klineDataRaw);

    if (exchangeBalanceData) {
        const priceDataForExchangeBalance = filterPriceDataToIndicatorRange(fullPriceChartData, exchangeBalanceData);
        renderExchangeBalanceChart(exchangeBalanceData, priceDataForExchangeBalance);
    }
    if (transactionVolumeData) {
        const priceDataForTransactionVolume = filterPriceDataToIndicatorRange(fullPriceChartData, transactionVolumeData);
        renderTransactionVolumeChart(transactionVolumeData, priceDataForTransactionVolume);
    }
    
    console.log("All whale/retail sentiment charts should be initialized.");
}); 