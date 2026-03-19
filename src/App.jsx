import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, ScatterChart, Scatter, ZAxis, Cell, Legend, ComposedChart
} from 'recharts';
import {
    Building, DollarSign, TrendingUp, MapPin, Activity, Hexagon, BarChart3, BookOpen, Cpu
} from 'lucide-react';
import './App.css';

const StatCard = ({ title, value, icon }) => (
    <div className="glass-card stat-card fade-in">
        <div className="stat-icon">{icon}</div>
        <div className="stat-info">
            <h3>{title}</h3>
            <div className="value">{value}</div>
        </div>
    </div>
);

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="custom-tooltip">
                <p style={{ margin: 0, fontWeight: 'bold' }}>{label}</p>
                {payload.map((entry, index) => {
                    // Ignore empty zero lines in custom tooltip
                    if(entry.name === 'Zero') return null;
                    return (
                        <p key={`item-${index}`} style={{ color: entry.color, margin: '4px 0 0 0' }}>
                            {entry.name}: {entry.name.toLowerCase().includes('price') || entry.name.toLowerCase().includes('trend') || entry.name.toLowerCase().includes('seasonal') || entry.name.toLowerCase().includes('resid') ? '$' : ''}{Number(entry.value).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        </p>
                    )
                })}
            </div>
        );
    }
    return null;
};

const parseCSV = (url) => new Promise((resolve, reject) => {
    Papa.parse(url, { download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: resolve, error: reject });
});

function App() {
    const [dataV6, setDataV6] = useState([]);
    const [dataV2, setDataV2] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            parseCSV('/property_clusters_extremePrice_removed_v6.csv'),
            parseCSV('/final_clean_market_dataset1_v2.csv')
        ]).then(([resV6, resV2]) => {
            setDataV6(resV6.data);
            setDataV2(resV2.data);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, []);

    const analytics = useMemo(() => {
        if (!dataV6.length || !dataV2.length) return null;

        const getMedian = (arr) => {
            if (!arr.length) return 0;
            const s = [...arr].sort((a,b) => a-b);
            const mid = Math.floor(s.length/2);
            return s.length % 2 !== 0 ? s[mid] : (s[mid-1]+s[mid])/2;
        };

        // V6 Processing (Time Series & K-Means Clusters)
        const timeSeriesMap = {};
        const scatterPoints = [];
        dataV6.forEach(item => {
            if (item.YearMonth && item.SalePrice) {
                if (!timeSeriesMap[item.YearMonth]) timeSeriesMap[item.YearMonth] = [];
                timeSeriesMap[item.YearMonth].push(item.SalePrice);
            }
            if (item.TotalFinishedArea > 0 && item.SalePrice > 0 && item.Cluster !== undefined) {
                if (Math.random() > 0.6) { // Sample data for frontend performance
                    scatterPoints.push({ area: item.TotalFinishedArea, price: item.SalePrice, cluster: item.Cluster });
                }
            }
        });

        const tsData = Object.keys(timeSeriesMap).sort().map(ym => ({
            date: ym, originalPrice: getMedian(timeSeriesMap[ym])
        }));
        tsData.forEach((item, i) => {
            if (i >= 2) item.movingAvg = (tsData[i].originalPrice + tsData[i-1].originalPrice + tsData[i-2].originalPrice) / 3;
            else if (i === 1) item.movingAvg = (tsData[i].originalPrice + tsData[i-1].originalPrice) / 2;
            else item.movingAvg = tsData[i].originalPrice;
        });

        // 1. Classical Additive Seasonal Decomposition Approximation
        const tsDecomp = tsData.map(d => ({ ...d }));
        
        // Trend: 7-month centered moving average 
        for (let i = 0; i < tsDecomp.length; i++) {
            let sum = 0, count = 0;
            for (let j = Math.max(0, i-3); j <= Math.min(tsDecomp.length-1, i+3); j++) {
                sum += tsDecomp[j].originalPrice;
                count++;
            }
            tsDecomp[i].trend = sum / count;
        }

        // Seasonal
        const seasonalMap = {};
        tsDecomp.forEach(d => {
            const month = d.date.substring(5, 7);
            if (!seasonalMap[month]) seasonalMap[month] = [];
            seasonalMap[month].push(d.originalPrice - d.trend);
        });
        const seasonalAvg = {};
        Object.keys(seasonalMap).forEach(m => {
            seasonalAvg[m] = seasonalMap[m].reduce((a,b)=>a+b,0) / seasonalMap[m].length;
        });

        // Assign seasonal, residual, and zeroLine
        tsDecomp.forEach(d => {
            const month = d.date.substring(5, 7);
            d.seasonal = seasonalAvg[month];
            d.residual = d.originalPrice - d.trend - d.seasonal;
            d.zero = 0;
        });

        // V2 Processing (Bar Charts, Histograms & Outlier Time Series)
        const nhoodMap = {};
        const typeMap = {};
        const logPrices = [];
        const prices = [];
        const tsSpikeMap = {};
        
        let validPropsV2 = 0;
        let totalValV2 = 0;

        dataV2.forEach(item => {
            validPropsV2++;
            totalValV2 += (item.SalePrice || 0);

            if (item.xrPrimaryNeighborhoodID && item.SalePrice > 0) {
                const nh = item.xrPrimaryNeighborhoodID;
                if (!nhoodMap[nh]) nhoodMap[nh] = { id: nh, total: 0, count: 0 };
                nhoodMap[nh].total += item.SalePrice;
                nhoodMap[nh].count++;
            }
            if (item.AssrLandUse && item.SalePrice > 0) {
                const t = item.AssrLandUse;
                if (!typeMap[t]) typeMap[t] = { name: t, total: 0, count: 0 };
                typeMap[t].total += item.SalePrice;
                typeMap[t].count++;
            }
            if (item.SalePrice > 0) prices.push(item.SalePrice);
            if (item.LogSalePrice > 0) logPrices.push(item.LogSalePrice);

            // Outlier Map
            if (item.SaleDate && item.SalePrice) {
                 // Convert '2024/07/01...' to '2024-07'
                 let ym = item.SaleDate.substring(0, 4) + '-' + item.SaleDate.substring(5, 7);
                 if (!tsSpikeMap[ym]) tsSpikeMap[ym] = [];
                 tsSpikeMap[ym].push(item.SalePrice);
            }
        });

        const tsSpikeData = Object.keys(tsSpikeMap).sort().map(ym => ({
             date: ym, medianPrice: getMedian(tsSpikeMap[ym])
        })).filter(d => d.date.startsWith("202")); // filter weird dates just in case

        const topNeighborhoods = Object.values(nhoodMap)
            .map(x => ({ name: String(x.id), avgPrice: x.total / x.count }))
            .sort((a, b) => b.avgPrice - a.avgPrice).slice(0, 10);
            
        const typesDist = Object.values(typeMap).map(x => ({ name: x.name, count: x.count })).sort((a,b) => b.count - a.count);
        const typesAvgPrice = Object.values(typeMap).map(x => ({ name: x.name, avgPrice: x.total / x.count })).sort((a,b) => a.avgPrice - b.avgPrice);

        const createHist = (arr, binsCount = 40) => {
            if (!arr.length) return [];
            let min = Math.min(...arr), max = Math.max(...arr);
            let size = (max - min) / binsCount;
            let bins = Array.from({length: binsCount}, (_, i) => ({
                binMin: min + i*size, count: 0
            }));
            arr.forEach(v => {
                let idx = Math.floor((v-min)/size);
                if(idx >= binsCount) idx = binsCount-1;
                bins[idx].count++;
            });
            return bins.map(b => ({ name: b.binMin > 1000 ? (b.binMin/1000000).toFixed(1)+'M' : b.binMin.toFixed(1), count: b.count }));
        };

        return {
            totalProps: validPropsV2,
            avgPrice: totalValV2 / validPropsV2,
            tsData, tsDecomp, tsSpikeData, scatterPoints, topNeighborhoods, typesDist, typesAvgPrice,
            histPrices: createHist(prices.filter(p=>p<5000000), 40), 
            histLogPrices: createHist(logPrices, 40)
        };
    }, [dataV6, dataV2]);

    const [activeTab, setActiveTab] = useState('TimeSeries');

    if (loading) return <div className="loader-container"><div className="spinner"></div><h2 className="gradient-text">Analyzing Datasets...</h2></div>;
    if (!analytics) return <div>Failed to compute analytics.</div>;

    const clusterColors = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

    return (
        <div className="dashboard-layout fade-in">
            <aside className="sidebar">
                <div className="brand gradient-text"><Hexagon size={28} /> InfraAnalytics</div>
                <nav className="nav-links">
                    <div className={`nav-item ${activeTab === 'Summary' ? 'active' : ''}`} onClick={() => setActiveTab('Summary')}><BookOpen size={20} /> Executive Summary</div>
                    <div className={`nav-item ${activeTab === 'Modeling' ? 'active' : ''}`} onClick={() => setActiveTab('Modeling')}><Cpu size={20} /> Predictive Modeling</div>
                    <div className={`nav-item ${activeTab === 'TimeSeries' ? 'active' : ''}`} onClick={() => setActiveTab('TimeSeries')}><TrendingUp size={20} /> Time Series Analysis</div>
                    <div className={`nav-item ${activeTab === 'Clustering' ? 'active' : ''}`} onClick={() => setActiveTab('Clustering')}><MapPin size={20} /> K-Means Clustering</div>
                    <div className={`nav-item ${activeTab === 'Distributions' ? 'active' : ''}`} onClick={() => setActiveTab('Distributions')}><Activity size={20} /> Price Distributions</div>
                    <div className={`nav-item ${activeTab === 'Neighborhoods' ? 'active' : ''}`} onClick={() => setActiveTab('Neighborhoods')}><Building size={20} /> Neighborhood Analysis</div>
                    <div className={`nav-item ${activeTab === 'PropertyTypes' ? 'active' : ''}`} onClick={() => setActiveTab('PropertyTypes')}><BarChart3 size={20} /> Property Type Insights</div>
                </nav>
            </aside>

            <main className="main-content">
                <header className="header">
                    <h1>Data-Driven Analysis of Built Infrastructure and Real Estate Markets</h1>
                    <p>Hartford, Connecticut residential real estate market analytics using {(3915).toLocaleString()} deduplicated transactions.</p>
                </header>

                <section className="stats-grid">
                    <StatCard title="Total Cleaned Records" value={(3915).toLocaleString()} icon={<Building size={24} />} />
                    <StatCard title="Overall Average Asset Price" value={`$${Math.round(analytics.avgPrice).toLocaleString()}`} icon={<DollarSign size={24} />} />
                </section>

                {/* EXECUTIVE SUMMARY TAB */}
                {activeTab === 'Summary' && (
                    <>
                        <div className="section-title"><h3>Project Overview</h3></div>
                        <div className="glass-card fade-in">
                            <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>The InfraAnalytics Team (Group 12)</h2>
                            <p className="text-secondary mb-4">Ananthasagar N, Meka Jahnavi, Nivasini J, Kavin M, Siddu Siddartha Reddy</p>
                            
                            <div className="insight-point mt-4">
                                <h4>Abstract & Problem Statement</h4>
                                <p>This report presents a comprehensive business analytics study on the Hartford, Connecticut residential real estate market. The raw dataset contained severe quality issues including zero-price transfers, duplication, and extreme outliers (such as a $10.2M commercial sale). Without cleaning and segmentation, critical distinctions in the market were completely hidden.</p>
                            </div>

                            <div className="insight-point mt-4">
                                <h4>Methodology</h4>
                                <p>The study applies a structured analytics pipeline encompassing data preprocessing, Exploratory Data Analysis (EDA), feature engineering, time-series analysis, and unsupervised machine learning through K-Means clustering. The dataset was progressively refined from 7,410 to 3,915 unique clean records effectively mapping out the true underlying market trends.</p>
                            </div>
                        </div>
                    </>
                )}

                {/* PREDICTIVE MODELING TAB */}
                {activeTab === 'Modeling' && (
                    <>
                        <div className="section-title"><h3>Machine Learning Models Analysis</h3></div>
                        <div className="glass-card fade-in">
                            <h2>Predicting LogSalePrice</h2>
                            <p className="text-secondary mb-4">Dataset was split into 80% training and 20% testing sets using PricePerSqft and AppraisalRatio as input features.</p>
                            
                            <table className="insights-table">
                                <thead>
                                    <tr>
                                        <th>Model</th>
                                        <th>R² Score</th>
                                        <th>MAE</th>
                                        <th>RMSE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td>Linear Regression</td><td>0.320</td><td>0.760</td><td>0.980</td></tr>
                                    <tr><td>Decision Tree</td><td>0.875</td><td>0.428</td><td>0.666</td></tr>
                                    <tr><td>Random Forest</td><td>0.929</td><td>0.342</td><td>0.503</td></tr>
                                    <tr><td>Gradient Boosting</td><td>0.934</td><td>0.343</td><td>0.485</td></tr>
                                </tbody>
                            </table>

                            <div className="insight-point mt-4">
                                <h4>Feature Importance Analysis</h4>
                                <p>Linear Regression performed poorly (R² = 0.32), confirming that property pricing is extensively non-linear. Gradient Boosting emerged as the best performer (R² = 0.934). Feature importance analysis from the Random Forest model showed that PricePerSqft (0.655) was the dominant predictor over AppraisalRatio (0.345), confirming the price-to-size ratio is a stronger signal than simply appraised value.</p>
                            </div>
                        </div>
                    </>
                )}

                {/* TIME SERIES TAB */}
                {activeTab === 'TimeSeries' && (
                    <>
                        <div className="section-title"><h3>Time Series Analysis</h3></div>
                        <section className="charts-grid-full">
                            
                            <div className="glass-card chart-card fade-in">
                                <div className="chart-header">
                                    <h2>Median Property Price Over Time (Outlier-Induced Spike)</h2>
                                    <p>Identified a $10.2M transaction recording error masking true trends prior to deduplication.</p>
                                </div>
                                <div className="chart-container">
                                    <ResponsiveContainer width="100%" height={250}>
                                        <LineChart data={analytics.tsSpikeData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickMargin={10} minTickGap={30} />
                                            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Line type="monotone" dataKey="medianPrice" name="Median Sale Price" stroke="#ec4899" strokeWidth={2} dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="glass-card chart-card fade-in">
                                <div className="chart-header">
                                    <h2>Smoothed Property Price Trend (Post-Deduplication)</h2>
                                    <p>Original Median Price vs 3-Month Moving Average over Time</p>
                                </div>
                                <div className="chart-container">
                                    <ResponsiveContainer width="100%" height={400}>
                                        <LineChart data={analytics.tsData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickMargin={10} minTickGap={30} />
                                            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickFormatter={(v) => `$${v/1000}k`} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend />
                                            <Line type="monotone" dataKey="originalPrice" name="Original Median Price" stroke="#38bdf8" strokeWidth={2} dot={false} />
                                            <Line type="monotone" dataKey="movingAvg" name="3-Month Moving Average" stroke="#f59e0b" strokeWidth={3} dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="insight-point mt-4">
                                    <h4>Steady 42% Growth Over Four Years</h4>
                                    <p>The market experienced its strongest single-year growth in 2022 (+11.4%) and again in 2024 (+17.3%). Median sale prices rose from $190,000 in 2020 to $269,900 in 2024. Transaction volumes peaked in 2021 (1,058) and have declined steadily since.</p>
                                </div>
                            </div>

                            <div className="glass-card chart-card fade-in">
                                <div className="chart-header">
                                    <h2>Seasonal Decomposition</h2>
                                    <p>Isolating the SalePrice into Trend, Seasonal, and Residual Components</p>
                                </div>
                                <div className="chart-container" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <ResponsiveContainer width="100%" height={120}>
                                        <LineChart data={analytics.tsDecomp} syncId="decomp" margin={{ top: 5, right: 30, left: 10, bottom: 0 }}>
                                            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${Math.round(v/1000)}k`} width={60}/>
                                            <Tooltip content={<CustomTooltip />} />
                                            <Line type="monotone" dataKey="originalPrice" name="SalePrice" stroke="#3b82f6" dot={false} strokeWidth={2}/>
                                        </LineChart>
                                    </ResponsiveContainer>
                                    <ResponsiveContainer width="100%" height={120}>
                                        <LineChart data={analytics.tsDecomp} syncId="decomp" margin={{ top: 5, right: 30, left: 10, bottom: 0 }}>
                                            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${Math.round(v/1000)}k`} width={60}/>
                                            <Tooltip content={<CustomTooltip />} />
                                            <Line type="monotone" dataKey="trend" name="Trend" stroke="#10b981" dot={false} strokeWidth={2}/>
                                        </LineChart>
                                    </ResponsiveContainer>
                                    <ResponsiveContainer width="100%" height={120}>
                                        <LineChart data={analytics.tsDecomp} syncId="decomp" margin={{ top: 5, right: 30, left: 10, bottom: 0 }}>
                                            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${Math.round(v/1000)}k`} width={60}/>
                                            <Tooltip content={<CustomTooltip />} />
                                            <Line type="monotone" dataKey="seasonal" name="Seasonal" stroke="#f59e0b" dot={false} strokeWidth={2}/>
                                        </LineChart>
                                    </ResponsiveContainer>
                                    <ResponsiveContainer width="100%" height={150}>
                                        <ComposedChart data={analytics.tsDecomp} syncId="decomp" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                            <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} tickMargin={5} minTickGap={30}/>
                                            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${Math.round(v/1000)}k`} width={60} domain={[-35000, 35000]}/>
                                            <Tooltip content={<CustomTooltip />} />
                                            <Scatter dataKey="residual" name="Resid" fill="#ec4899" />
                                            <Line type="monotone" dataKey="zero" name="Zero" stroke="rgba(255,255,255,0.3)" strokeWidth={1} dot={false} activeDot={false} legendType="none"/>
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {/* CLUSTERING TAB */}
                {activeTab === 'Clustering' && (
                    <>
                        <div className="section-title"><h3>K-Means Clustering</h3></div>
                        <section className="charts-grid-full">
                            <div className="glass-card chart-card fade-in">
                                <div className="chart-header">
                                    <h2>Property Clusters (Outliers Removed)</h2>
                                    <p>Sale Price vs Total Finished Area (k=3)</p>
                                </div>
                                <div className="chart-container">
                                    <ResponsiveContainer width="100%" height={400}>
                                        <ScatterChart margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis type="number" dataKey="area" name="Total Area" unit=" sqft" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                                            <YAxis type="number" dataKey="price" name="Sale Price" unit=" $" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                                            <ZAxis type="number" range={[20, 20]} />
                                            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                                            <Scatter name="Assets" data={analytics.scatterPoints}>
                                                {analytics.scatterPoints.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={clusterColors[entry.cluster % clusterColors.length]} fillOpacity={0.8} />
                                                ))}
                                            </Scatter>
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="mt-4">
                                    <h4>Market Segmentation Details</h4>
                                    <table className="insights-table">
                                        <thead>
                                            <tr>
                                                <th>Metric</th>
                                                <th>Cluster 0 (Affordable)</th>
                                                <th>Cluster 1 (Large Premium)</th>
                                                <th>Cluster 2 (Compact High-Value)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr><td>Count</td><td>1,392</td><td>1,595</td><td>928</td></tr>
                                            <tr><td>Median Sale Price</td><td>$101,000</td><td>$295,100</td><td>$229,950</td></tr>
                                            <tr><td>Median Finished Area</td><td>1,311 sq ft</td><td>3,450 sq ft</td><td>1,260 sq ft</td></tr>
                                            <tr><td>Median Price/Sqft</td><td>$88.30</td><td>$89.30</td><td>$174.70</td></tr>
                                            <tr><td>Median Appraisal Ratio</td><td>0.988</td><td>1.127</td><td>1.259</td></tr>
                                            <tr><td>Dominant Property Type</td><td>Multi-family / Condo</td><td>Large residential</td><td>Condo / small unit</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {/* PRICE DISTRIBUTIONS TAB */}
                {activeTab === 'Distributions' && (
                    <>
                        <div className="section-title"><h3>Price Distributions</h3></div>
                        <section className="charts-grid-full grid-2 fade-in">
                            <div className="glass-card chart-card">
                                <div className="chart-header"><h2>Sale Price Distribution</h2></div>
                                <div className="chart-container">
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={analytics.histPrices} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="count" fill="#3b82f6" name="Properties" radius={[2, 2, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="insight-point mt-4">
                                    <p>SalePrice is strongly right-skewed—a small number of very expensive properties pull the mean significantly above the median.</p>
                                </div>
                            </div>
                            
                            <div className="glass-card chart-card">
                                <div className="chart-header"><h2>Log Sale Price Distribution</h2></div>
                                <div className="chart-container">
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={analytics.histLogPrices} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="count" fill="#3b82f6" name="Properties" radius={[2, 2, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="insight-point mt-4">
                                    <p>A logarithmic transformation resolves the heavy skew and converges toward normal distribution, which critically helps machine learning models learn patterns more effectively.</p>
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {/* NEIGHBORHOODS TAB */}
                {activeTab === 'Neighborhoods' && (
                    <>
                        <div className="section-title"><h3>Neighborhood Analysis</h3></div>
                        <section className="charts-grid-full">
                            <div className="glass-card chart-card fade-in">
                                <div className="chart-header">
                                    <h2>Top 10 Neighborhoods by Average Sale Price</h2>
                                </div>
                                <div className="chart-container">
                                    <ResponsiveContainer width="100%" height={400}>
                                        <BarChart data={analytics.topNeighborhoods} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                                            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="avgPrice" fill="#14b8a6" name="Avg Sale Price" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="insight-point mt-4">
                                    <p>Neighbourhood ID is a highly meaningful variable—certain neighbourhood clusters show distinctly higher average prices, proving location remains a premier market signal.</p>
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {/* PROPERTY TYPES TAB */}
                {activeTab === 'PropertyTypes' && (
                    <>
                        <div className="section-title"><h3>Property Type Insights</h3></div>
                        <section className="charts-grid-full grid-2 fade-in">
                            <div className="glass-card chart-card">
                                <div className="chart-header"><h2>Property Type Distribution</h2></div>
                                <div className="chart-container">
                                    <ResponsiveContainer width="100%" height={350}>
                                        <BarChart data={analytics.typesDist.slice(0, 10)} margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="name" stroke="#94a3b8" angle={-45} textAnchor="end" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="count" fill="#8b5cf6" name="Count" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="glass-card chart-card">
                                <div className="chart-header"><h2>Average Sale Price by Property Type</h2></div>
                                <div className="chart-container">
                                    <ResponsiveContainer width="100%" height={350}>
                                        <BarChart data={analytics.typesAvgPrice.slice(0, 10)} margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="name" stroke="#94a3b8" angle={-45} textAnchor="end" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="avgPrice" fill="#ec4899" name="Avg Sale Price" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </section>

                        <div className="glass-card mt-4 fade-in">
                           <div className="insight-point">
                                <h4>Broad Market Demand</h4>
                                <p>ONE FAMILY homes dominate (33.4% of raw records), offering the most consistent buyer market with broad demand across all income levels.</p>
                           </div>
                           <div className="insight-point mt-4">
                                <h4>Compact Urban Premiums</h4>
                                <p>CONDOMINIUM units represent the second-largest segment and are disproportionately represented in the high price-per-sqft category, indicating urban condo premiums. The divergence between their appraisal ratio (1.259) suggests these are systematically under-appraised by municipal systems.</p>
                           </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

export default App;
