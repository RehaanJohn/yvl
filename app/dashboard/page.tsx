'use client';

import Galaxy from '../components/Galaxy';
import RiskGaugePanel from '../components/RiskGaugePanel';
import VaultPanel from '../components/VaultPanel';
import VolSpikeButton from '../components/VolSpikeButton';

export default function Dashboard() {
  return (
    <div className="page-root" style={{ overflowY: 'auto' }}>
      {/* Background */}
      <div className="galaxy-bg" style={{ position: 'fixed' }}>
        <Galaxy
          hueShift={220}
          saturation={1.8}
          glowIntensity={0.45}
          density={1.2}
          twinkleIntensity={0.5}
          rotationSpeed={0.04}
          speed={0.6}
          repulsionStrength={1.8}
          transparent={false}
        />
      </div>

      <main className="dashboard-main relative z-10 p-8 pt-24 min-h-screen flex flex-col gap-8 max-w-7xl mx-auto">
        <header className="mb-4">
          <h1 className="text-4xl font-bold font-syne text-white tracking-tight">Protocol Dashboard</h1>
          <p className="text-white/50 mt-2">Manage your collateral and monitor real-time volatility bands.</p>
        </header>

        {/* Demo Explanation Section */}
        <div className="demo-explanation bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
          <h2 className="text-lg font-syne font-bold text-white mb-2">Hackathon Demo Flow</h2>
          <ol className="list-decimal list-inside text-white/70 space-y-2 text-sm">
            <li><strong>The Setup:</strong> Deposit <strong>100 AAPL</strong> and <strong>100 PLTR</strong> into their respective vaults.</li>
            <li><strong>The Observation:</strong> Look at the Live Risk Gauges. PLTR is historically volatile and sits in <strong>Band 1 (55% LTV)</strong>. AAPL is stable and sits in <strong>Band 0 (75% LTV)</strong>.</li>
            <li><strong>The Proof:</strong> Go to the Borrow tab. Notice that even though you deposited the exact same amount of tokens, the algorithm automatically grants you higher borrowing power for AAPL.</li>
            <li><strong>The Climax:</strong> Use the "Simulate Vol Spike" buttons below to crash the AAPL price. Watch the Risk Gauge spike and the LTV band safely step down via hysteresis, protecting the protocol from insolvency!</li>
          </ol>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Risk & Demo Tools */}
          <div className="flex flex-col gap-8">
            <RiskGaugePanel />
            
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md flex flex-col gap-6">
              <h3 className="font-syne font-bold text-white/90">Oracle Admin Tools (Demo)</h3>
              <VolSpikeButton symbol="AAPL" />
              <VolSpikeButton symbol="PLTR" />
            </div>
          </div>

          {/* Right Column: Vaults */}
          <div className="flex flex-col gap-8">
            <VaultPanel symbol="AAPL" />
            <VaultPanel symbol="PLTR" />
          </div>
        </div>
      </main>
    </div>
  );
}
