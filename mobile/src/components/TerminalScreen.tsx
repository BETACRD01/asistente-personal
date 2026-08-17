import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  APP_TOKEN,
  DEVICE_TOKEN,
  HUB_URL,
  HUB_WS_TERM,
  TERM_HOST,
  TERM_PORT,
  TERM_TOKEN,
} from '../config';
import { TERMINAL_HTML } from '../term/terminalHtml';

type Mode = 'cloud' | 'local';

interface TerminalScreenProps {
  onClose?: () => void;
}

export default function TerminalScreen({ onClose }: TerminalScreenProps) {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const [host, setHost] = useState(TERM_HOST);
  const [port, setPort] = useState(TERM_PORT);
  const [token, setToken] = useState(TERM_TOKEN);
  const [mode, setMode] = useState<Mode>('cloud');
  const [wsUrl, setWsUrl] = useState('');
  const [key, setKey] = useState(1);
  const [conn, setConn] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>(
    'connecting',
  );

  const connect = useCallback(async () => {
    setConn('connecting');
    let url: string;
    if (mode === 'local') {
      url = `ws://${host.trim()}:${port.trim() || '8766'}/term?token=${encodeURIComponent(
        token.trim(),
      )}`;
    } else {
      try {
        const response = await fetch(`${HUB_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: APP_TOKEN }),
        });
        const data = await response.json();
        url = `${HUB_WS_TERM}?token=${data.token}&device=${DEVICE_TOKEN}`;
      } catch {
        setConn('error');
        return;
      }
    }
    setWsUrl(url);
    setKey(k => k + 1);
  }, [host, port, token, mode]);

  const html = TERMINAL_HTML.replace('__MODE__', mode);
  const injected = `window.__WS__ = ${JSON.stringify(wsUrl)};`;

  const connColor =
    conn === 'connected' ? styles.pillOn : conn === 'connecting' ? styles.pillWarn : styles.pillErr;
  const connLabel =
    conn === 'connected'
      ? 'Conectado'
      : conn === 'connecting'
        ? 'Conectando…'
        : 'Desconectado';

  return (
    <View
      style={[
        styles.container,
        dark && styles.containerDark,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <View style={styles.bar}>
        <View style={[styles.statusPill, connColor]}>
          <Text style={styles.statusText}>{connLabel}</Text>
        </View>
        <Pressable
          style={[styles.modeBtn, mode === 'cloud' && styles.modeBtnOn]}
          onPress={() => setMode('cloud')}>
          <Text style={[styles.modeBtnText, mode === 'cloud' && styles.modeBtnTextOn]}>Nube</Text>
        </Pressable>
        <Pressable
          style={[styles.modeBtn, mode === 'local' && styles.modeBtnOn]}
          onPress={() => setMode('local')}>
          <Text style={[styles.modeBtnText, mode === 'local' && styles.modeBtnTextOn]}>Wi-Fi</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={connect}>
          <Text style={styles.btnText}>Conectar</Text>
        </Pressable>
        {onClose && (
          <Pressable style={[styles.btn, styles.btnClose]} onPress={onClose}>
            <Text style={styles.btnText}>✕</Text>
          </Pressable>
        )}
      </View>
      {mode === 'local' && (
        <View style={styles.localRow}>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="IP de la Mac"
            placeholderTextColor="#8e8e93"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, styles.inputPort]}
            value={port}
            onChangeText={setPort}
            placeholder="8766"
            placeholderTextColor="#8e8e93"
            keyboardType="number-pad"
          />
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="Token"
            placeholderTextColor="#8e8e93"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
        </View>
      )}
      <WebView
        key={key}
        originWhitelist={['*']}
        source={{ html }}
        injectedJavaScriptBeforeContentLoaded={injected}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onMessage={event => {
          const state = String(event.nativeEvent.data);
          if (
            state === 'connecting' ||
            state === 'connected' ||
            state === 'disconnected' ||
            state === 'error'
          ) {
            setConn(state);
          }
        }}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e1e' },
  containerDark: { backgroundColor: '#1e1e1e' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#2d2d30',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginRight: 8,
  },
  statusText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  pillOn: { backgroundColor: '#34c759' },
  pillWarn: { backgroundColor: '#ff9500' },
  pillErr: { backgroundColor: '#ff3b30' },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginRight: 6,
    backgroundColor: '#48484a',
  },
  modeBtnOn: { backgroundColor: '#10a37f' },
  modeBtnText: { color: '#c7c7cc', fontWeight: '600', fontSize: 13 },
  modeBtnTextOn: { color: '#ffffff' },
  localRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#2d2d30',
  },
  input: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#ffffff',
    marginRight: 6,
  },
  inputPort: { flex: 0.4 },
  btn: {
    backgroundColor: '#10a37f',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 6,
  },
  btnClose: { backgroundColor: '#48484a' },
  btnText: { color: '#ffffff', fontWeight: '600', fontSize: 13 },
  web: { flex: 1, backgroundColor: '#1e1e1e' },
});