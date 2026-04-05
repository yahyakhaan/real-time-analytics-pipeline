import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);
ChartJS.defaults.color = '#94a3b8';
ChartJS.defaults.scale.grid.color = 'rgba(255,255,255,0.05)';

export default function App() {
  const [activeTab, setActiveTab] = useState('live');
  const [liveData, setLiveData] = useState({ metrics: {}, requests: {}, revenue: {}, history: [], uniqueUsers: 0 });
  const [historicalData, setHistoricalData] = useState([]);

  // Handle Live SSE Stream
  useEffect(() => {
    const eventSource = new EventSource('/stream');
    eventSource.onmessage = (e) => setLiveData(JSON.parse(e.data));
    return () => eventSource.close(); // Cleanup on unmount
  }, []);

  // Handle Historical Polling
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/history/revenue');
        const data = await res.json();
        setHistoricalData(data);
      } catch (err) { console.error(err); }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', color: '#e2e8f0' }}>Operations Center</h1>
      
      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
        <button 
          onClick={() => setActiveTab('live')}
          style={{ padding: '10px 20px', background: activeTab === 'live' ? '#3b82f6' : 'transparent', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          🔴 Live Ops
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          style={{ padding: '10px 20px', background: activeTab === 'analytics' ? '#6366f1' : 'transparent', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          📊 Analytics
        </button>
      </div>

      {/* Conditional Rendering based on Tab */}
      {activeTab === 'live' ? <LiveOpsView data={liveData} /> : <AnalyticsView data={historicalData} />}
    </div>
  );
}

// --- TAB 1: LIVE OPS COMPONENT ---
function LiveOpsView({ data }) {
  const historyRaw = data.history ? data.history.map(Number).reverse() : [];
  
  const lineChartData = {
    labels: historyRaw.map((_, i) => `-${(historyRaw.length - 1 - i) * 10}s`),
    datasets: [{ label: 'Events / 10s', data: historyRaw, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4 }]
  };

  const doughnutData = {
    labels: ['Atlanta', 'San Francisco', 'New York', 'Chicago'],
    datasets: [{
      data: ['Atlanta', 'San Francisco', 'New York', 'Chicago'].map(city => parseInt(data.requests[city] || 0)),
      backgroundColor: ['#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'],
      borderWidth: 0
    }]
  };

  const sortedRevenue = Object.entries(data.revenue || {}).sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
      
      {/* Top Row */}
      <div style={{ gridColumn: '1 / -1', background: '#1e293b', padding: '25px', borderRadius: '12px', display: 'flex', gap: '40px' }}>
        <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#10b981' }}>{data.uniqueUsers || 0}</div>
          <div style={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.9rem' }}>Unique Active Users</div>
        </div>
        <div style={{ flex: 3 }}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: '#cbd5e1' }}>Event Throughput (Last 5 Mins)</h2>
          <div style={{ height: '200px' }}><Line data={lineChartData} options={{ maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } }} /></div>
        </div>
      </div>

      {/* Bottom Left */}
      <div style={{ background: '#1e293b', padding: '25px', borderRadius: '12px' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#cbd5e1' }}>Active Ride Requests</h2>
        <div style={{ height: '250px' }}><Doughnut data={doughnutData} options={{ maintainAspectRatio: false, cutout: '70%' }} /></div>
      </div>

      {/* Bottom Right */}
      <div style={{ background: '#1e293b', padding: '25px', borderRadius: '12px' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#cbd5e1', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>Live Revenue</h2>
        {sortedRevenue.map(([city, amount]) => (
          <div key={city} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #334155' }}>
            <span>{city}</span>
            <span style={{ color: '#10b981', fontWeight: 'bold', fontFamily: 'monospace' }}>${parseFloat(amount).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- TAB 2: ANALYTICS COMPONENT ---
function AnalyticsView({ data }) {
  const barChartData = {
    labels: data.map(row => row.city),
    datasets: [{
      label: 'All-Time Revenue ($)',
      data: data.map(row => parseFloat(row.total_revenue)),
      backgroundColor: '#6366f1',
      borderRadius: 4
    }]
  };

  return (
    <div style={{ background: '#1e293b', padding: '25px', borderRadius: '12px' }}>
      <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#cbd5e1' }}>Historical Revenue by City (PostgreSQL)</h2>
      <div style={{ height: '400px' }}>
        <Bar data={barChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
      </div>
    </div>
  );
}