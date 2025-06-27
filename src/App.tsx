import KpiBoard from './components/KpiBoard';
import PositionTable from './components/PositionTable';
import TradeTable from './components/TradeTable';
import './index.css';

export default function App(){
  return (
    <div className="max-w-5xl mx-auto p-4">
      <KpiBoard/>
      <PositionTable/>
      <TradeTable/>
    </div>
  );
}
