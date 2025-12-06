import React from 'react';

interface VisualizerProps {
  volume: number; // 0 to 1
  active: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ volume, active }) => {
  // Create a few bars based on volume
  const bars = Array.from({ length: 5 }).map((_, i) => {
    // vary height based on volume and random jitter for effect
    const height = Math.max(10, volume * 100 * (1 + Math.sin(i)) + (active ? Math.random() * 20 : 0));
    return (
      <div
        key={i}
        className={`w-3 mx-1 bg-blue-400 rounded-full transition-all duration-75 ease-in-out ${active ? 'opacity-100' : 'opacity-30'}`}
        style={{ height: `${height}%` }}
      />
    );
  });

  return (
    <div className="h-32 flex items-center justify-center overflow-hidden w-full max-w-xs">
       {bars}
    </div>
  );
};

export default Visualizer;
