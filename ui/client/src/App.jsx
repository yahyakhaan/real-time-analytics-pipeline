import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);
ChartJS.defaults.color = '#94a3b8';
ChartJS.defaults.scale.grid.color = 'rgba(255,255,255,0.05)';

export default function App() {
  const [activeTab, setActiveTab] = useState('live');
  const [liveData, setLiveData] = useState({ metrics: {}, requests: {}, revenue: {}, history: [], uniqueUsers: 0, latency: 0 });
  const [historicalData, setHistoricalData] = useState([]);

  useEffect(() => {
    const eventSource = new EventSource('/stream');
    eventSource.onmessage = (e) => setLiveData(JSON.parse(e.data));
    return () => eventSource.close();
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/history/revenue');
        setHistoricalData(await res.json());
      } catch (err) { console.error(err); }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* HEADER & ARCHITECTURE DIAGRAM */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: 0, color: '#e2e8f0' }}>Operations Center</h1>
          <p style={{ color: '#94a3b8', margin: '5px 0 0 0', maxWidth: '600px', lineHeight: '1.5' }}>
            This dashboard is powered by a live Apache Flink cluster consuming Kafka streams, executing stateful tumbling windows, and dual-writing to Redis (Hot) and PostgreSQL (Cold).
          </p>
        </div>
        
        {/* Animated SVG Pipeline Diagram */}
        <div style={{ background: '#1e293b', padding: '15px 25px', borderRadius: '12px', border: '1px solid #334155' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: '#cbd5e1', fontSize: '0.9rem', fontWeight: 'bold' }}>
             <span style={{ color: '#3b82f6' }}>Kafka</span>
             <span>→</span>
             <span style={{ color: '#f59e0b' }}>Flink Cluster</span>
             <span>→</span>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
               <span style={{ color: '#ef4444' }}>Redis (Live)</span>
               <span style={{ color: '#10b981' }}>Postgres (History)</span>
             </div>
           </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
        <button onClick={() => setActiveTab('live')} style={{ padding: '10px 20px', background: activeTab === 'live' ? '#3b82f6' : 'transparent', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>🔴 Live Ops</button>
        <button onClick={() => setActiveTab('analytics')} style={{ padding: '10px 20px', background: activeTab === 'analytics' ? '#6366f1' : 'transparent', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>📊 Analytics</button>
      </div>

      {activeTab === 'live' ? <LiveOpsView data={liveData} /> : <AnalyticsView data={historicalData} />}
    </div>
  );
}

// --- LIVE OPS VIEW ---
function LiveOpsView({ data }) {
  const historyRaw = data.history ? data.history.map(Number).reverse() : [];
  
  // NEW: State to manage button feedback
  const [status, setStatus] = useState({ loading: false, message: '' });
  
  const triggerSimulation = async (type, count) => {
    // 1. Immediately show loading state
    setStatus({ loading: true, message: `Injecting ${count} events into Kafka...` });
    
    try {
      await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, count })
      });
      
      // 2. Show success message
      setStatus({ loading: false, message: `✅ Success! Watch the charts in 10s.` });
      
      // 3. Clear the message after 4 seconds
      setTimeout(() => {
        setStatus({ loading: false, message: '' });
      }, 4000);
      
    } catch (error) {
      setStatus({ loading: false, message: `❌ Error connecting to API.` });
      setTimeout(() => setStatus({ loading: false, message: '' }), 4000);
    }
  };

  const lineChartData = {
    labels: historyRaw.map((_, i) => `-${(historyRaw.length - 1 - i) * 10}s`),
    datasets: [{ label: 'Events / 10s', data: historyRaw, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4 }]
  };

  const doughnutData = {
    labels: ['Atlanta', 'San Francisco', 'New York', 'Chicago'],
    datasets: [{ data: ['Atlanta', 'San Francisco', 'New York', 'Chicago'].map(city => parseInt(data.requests[city] || 0)), backgroundColor: ['#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'], borderWidth: 0 }]
  };

  const sortedRevenue = Object.entries(data.revenue || {}).sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
      
      {/* GOD MODE & METRICS ROW */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '20px' }}>
        {/* God Mode Controls */}
        <div style={{ flex: 1, background: '#1e293b', padding: '25px', borderRadius: '12px', border: '1px solid #3b82f6', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
             ⚡ God Mode (Testing)
          </h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* NEW: Disable buttons while loading and change opacity */}
            <button 
              disabled={status.loading}
              onClick={() => triggerSimulation('surge', 500)} 
              style={{ flex: 1, padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: status.loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: status.loading ? 0.6 : 1 }}
            >
              Simulate Traffic Surge (500)
            </button>
            <button 
              disabled={status.loading}
              onClick={() => triggerSimulation('revenue', 200)} 
              style={{ flex: 1, padding: '12px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: status.loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: status.loading ? 0.6 : 1 }}
            >
              Trigger Mass Payout (200)
            </button>
          </div>
          
          {/* NEW: Feedback Message Area */}
          <div style={{ minHeight: '24px', marginTop: '12px', textAlign: 'center', fontSize: '0.9rem', color: status.message.includes('✅') ? '#10b981' : '#94a3b8', transition: 'all 0.3s' }}>
            {status.message}
          </div>
        </div>

        {/* Latency & Users */}
        <div style={{ flex: 1, background: '#1e293b', padding: '25px', borderRadius: '12px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#10b981' }}>{data.uniqueUsers || 0}</div>
            <div style={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>Active Users</div>
          </div>
          <div style={{ width: '1px', height: '60px', background: '#334155' }}></div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: data.latency < 500 ? '#3b82f6' : '#ef4444', display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
              {data.latency || 0} <span style={{ fontSize: '1rem', marginLeft: '4px' }}>ms</span>
            </div>
            <div style={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>Pipeline Latency</div>
          </div>
        </div>
      </div>

      <div style={{ background: '#1e293b', padding: '25px', borderRadius: '12px', gridColumn: '1 / -1' }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: '#cbd5e1' }}>Event Throughput (Last 5 Mins)</h2>
        <div style={{ height: '200px' }}><Line data={lineChartData} options={{ maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } }} /></div>
      </div>

      <div style={{ background: '#1e293b', padding: '25px', borderRadius: '12px' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#cbd5e1' }}>Active Ride Requests</h2>
        <div style={{ height: '250px' }}><Doughnut data={doughnutData} options={{ maintainAspectRatio: false, cutout: '70%' }} /></div>
      </div>

      <div style={{ background: '#1e293b', padding: '25px', borderRadius: '12px' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#cbd5e1', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>Live Revenue</h2>
        {sortedRevenue.map(([city, amount]) => (
          <div key={city} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #334155' }}>
            <span>{city}</span><span style={{ color: '#10b981', fontWeight: 'bold', fontFamily: 'monospace' }}>${parseFloat(amount).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function AnalyticsView({ data }) {
  const barChartData = { labels: data.map(row => row.city), datasets: [{ label: 'All-Time Revenue ($)', data: data.map(row => parseFloat(row.total_revenue)), backgroundColor: '#6366f1', borderRadius: 4 }] };
  return (
    <div style={{ background: '#1e293b', padding: '25px', borderRadius: '12px' }}>
      <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#cbd5e1' }}>Historical Revenue by City (PostgreSQL)</h2>
      <div style={{ height: '400px' }}><Bar data={barChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
    </div>
  );
}