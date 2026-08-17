import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TerminalScreen from './src/components/TerminalScreen';

function App() {
  return (
    <SafeAreaProvider>
      <TerminalScreen onClose={undefined} />
    </SafeAreaProvider>
  );
}

export default App;