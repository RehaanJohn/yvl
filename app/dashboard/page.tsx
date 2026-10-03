'use client';

import Galaxy from '../components/Galaxy';
import RiskGaugePanel from '../components/RiskGaugePanel';
import VaultPanel from '../components/VaultPanel';
import AdminPanel from '../components/AdminPanel';
import { useSupportedAssets, useAssetMetadata } from '../web3/useProtocol';

// Wrapper to fetch symbol/name for the VaultPanel dynamically
function DynamicVault({ assetAddress }: { assetAddress: `0x${string}` }) {
  const { symbol, name } = useAssetMetadata(assetAddress);
  return <VaultPanel assetAddress={assetAddress} symbol={symbol} name={name} />;
}

export default function Dashboard() {
  const { assets, isLoading } = useSupportedAssets();

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
          <h1 className="text-4xl font-bold font-syne text-white tracking-tight">Market Explorer</h1>
          <p className="text-white/50 mt-2">Manage collateral across real-time dynamic volatility markets.</p>
        </header>

        {/* Demo Explanation Section */}
        <div className="demo-explanation bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
          <h2 className="text-lg font-syne font-bold text-white mb-2">Live Dynamic LTV Demo</h2>
          <p className="text-white/70 text-sm leading-relaxed mb-3">
            This dashboard dynamically pulls all supported markets from the LendingVault contract.
            Each market's volatility is tracked in real-time via Arbitrum Sepolia Chainlink price feeds.
          </p>
          <ol className="list-decimal list-inside text-white/70 space-y-2 text-sm">
            <li><strong>Deposit:</strong> Get testnet WETH, WBTC, or LINK, and deposit them below.</li>
            <li><strong>Risk Adjusted LTV:</strong> Look at the Live Risk Gauges. The protocol algorithmically assigns lower LTVs to highly volatile assets.</li>
            <li><strong>Borrow:</strong> Notice how your borrowing power accurately reflects the real-world historical volatility of each asset!</li>
          </ol>
        </div>

        <AdminPanel />

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Risk */}
          <div className="flex flex-col gap-8">
            <RiskGaugePanel />
          </div>

          {/* Right Column: Dynamic Vaults */}
          <div className="flex flex-col gap-8">
            {isLoading && <p className="text-white/50">Loading Vaults...</p>}
            {assets.map((assetAddress) => (
              <DynamicVault key={assetAddress} assetAddress={assetAddress} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
