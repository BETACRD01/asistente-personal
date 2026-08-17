import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TERM_HOST, TERM_PORT, TERM_TOKEN } from '../config';
import { TERMINAL_HTML } from '../term/terminalHtml';

interface TerminalScreenProps {
  onClose?: () => void;
}

export default function TerminalScreen({ onClose }: TerminalScreenProps) {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const [host, setHost] = useState(TERM_HOST);
  const [port, setPort] = useState(TERM_PORT);
  const [token, setToken] = useState(TERM_TOKEN);
  const [key, setKey] = useState(1);
  const [conn, setConn] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>(
    'connecting',
  );

  const html = TERMINAL_HTML.replace('__HOST__', host.trim())
    .replace('__PORT__', port.trim() || '8766')
    .replace('__TOKEN__', token.trim());

  const connect = useCallback(() => {
    setConn('connecting');
    setKey(k => k + 1);
  }, []);

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
        <Pressable style={styles.btn} onPress={connect}>
          <Text style={styles.btnText}>Conectar</Text>
        </Pressable>
        {onClose && (
          <Pressable style={[styles.btn, styles.btnClose]} onPress={onClose}>
            <Text style={styles.btnText}>✕</Text>
          </Pressable>
        )}
      </View>
      <TextInput
        style={styles.tokenInput}
        value={token}
        onChangeText={setToken}
        placeholder="Token del terminal"
        placeholderTextColor="#8e8e93"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <WebView
        key={key}
        originWhitelist={['*']}
        source={{ html }}
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
  input: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
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
  tokenInput: {
    backgroundColor: '#1c1c1e',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#8e8e93',
  },
  web: { flex: 1, backgroundColor: '#1e1e1e' },
});