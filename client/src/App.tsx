import { Routes, Route } from 'react-router-dom';
import { GameSelector } from './components/GameSelector';
import { Lobby } from './components/Lobby';
import { GameShell } from './components/GameShell';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GameSelector />} />
      <Route path="/lobby/:roomId" element={<Lobby />} />
      <Route path="/play/:roomId" element={<GameShell />} />
    </Routes>
  );
}
