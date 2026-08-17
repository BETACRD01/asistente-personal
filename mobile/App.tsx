import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatMessage, HubClient } from './src/api/hubClient';
import MessageBubble from './src/components/MessageBubble';
import SuggestionChips from './src/components/SuggestionChips';
import { DEVICE_TOKEN } from './src/config';

const SUGGESTIONS = [
  'Abre Safari',
  '¿Cuánta memoria tiene mi Mac?',
  'Crea una carpeta llamada "prueba"',
  '¿Qué hora es?',
  'Muestra los archivos de Escritorio',
];

function ChatScreen() {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const clientRef = useRef<HubClient | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Conectando a tu Mac...');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    const client = new HubClient();
    clientRef.current = client;

    client
      .login()
      .then(() => {
        client.setMessageHandler(message => handleMessage(message));
        client.connect(DEVICE_TOKEN);
      })
      .catch(error => {
        setStatus(error.message);
      });

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, []);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'connected':
        setStatus('Conectado a tu Mac');
        setConnected(true);
        break;
      case 'reconnecting':
        setStatus('Reconectando...');
        setConnected(false);
        break;
      case 'error':
        setStatus(message.message || 'Error');
        setConnected(false);
        break;
      case 'token': {
        const id = message.id;
        setMessages(prev => {
          const existing = prev.find(m => m.id === id);
          if (existing) {
            return prev.map(m =>
              m.id === id
                ? { ...m, content: m.content + (message.content ?? ''), streaming: true }
                : m,
            );
          }
          return [...prev, { id, role: 'assistant', content: message.content ?? '', streaming: true }];
        });
        break;
      }
      case 'done':
        setBusy(false);
        setMessages(prev =>
          prev.map(m => (m.id === message.id ? { ...m, streaming: false } : m)),
        );
        break;
      case 'error':
        setBusy(false);
        setMessages(prev =>
          prev.map(m => (m.id === message.id ? { ...m, streaming: false } : m)),
        );
        break;
      case 'stdout':
        setStatus('Ejecutando en tu Mac...');
        break;
      default:
        break;
    }
  }, []);

  const send = (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || !connected || busy) {
      return;
    }
    const id = `u${Date.now()}`;
    setMessages(prev => [...prev, { id, role: 'user', content: text }]);
    setInput('');
    setBusy(true);
    clientRef.current?.sendCommand(DEVICE_TOKEN, text);
  };

  const sendSuggestion = (text: string) => {
    if (!connected || busy) {
      return;
    }
    const id = `u${Date.now()}`;
    setMessages(prev => [...prev, { id, role: 'user', content: text }]);
    setBusy(true);
    clientRef.current?.sendCommand(DEVICE_TOKEN, text);
  };

  const reconnect = useCallback(() => {
    const client = clientRef.current;
    if (!client) {
      return;
    }
    setConnected(false);
    setStatus('Conectando...');
    client.disconnect();
    client
      .login()
      .then(() => {
        client.setMessageHandler(handleMessage);
        client.connect(DEVICE_TOKEN);
      })
      .catch(error => {
        setStatus(error.message);
      });
  }, [handleMessage]);

  const showWelcome = messages.length === 0;

  return (
    <View
      style={[
        styles.container,
        dark ? styles.containerDark : null,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <View style={[styles.header, dark ? styles.headerDark : null]}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>🤖</Text>
          </View>
          <View>
            <Text style={[styles.title, dark ? styles.textDark : null]}>Asistente IA</Text>
            <View style={[styles.statusPill, connected ? styles.pillOn : styles.pillOff]}>
              <Text style={styles.statusPillText}>
                {connected ? 'Conectado a tu Mac' : status}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          {!connected && (
            <Pressable
              style={[styles.reconnect, dark ? styles.chipDark : null]}
              onPress={reconnect}>
              <Text style={[styles.newChatText, dark ? styles.textDark : null]}>⟳ Conectar</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.newChat, dark ? styles.chipDark : null]}
            onPress={() => setMessages([])}>
            <Text style={[styles.newChatText, dark ? styles.textDark : null]}>✎ Nuevo</Text>
          </Pressable>
        </View>
      </View>

      {showWelcome ? (
        <View style={styles.welcome}>
          <Text style={[styles.welcomeTitle, dark ? styles.textDark : null]}>
            ¿En qué te ayudo hoy?
          </Text>
          <Text style={styles.welcomeSub}>
            Controla tu Mac desde aquí: apps, archivos, terminal y más.
          </Text>
          <SuggestionChips dark={dark} suggestions={SUGGESTIONS} onSelect={sendSuggestion} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => <MessageBubble item={item} dark={dark} />}
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}>
        <View style={[styles.inputWrap, dark ? styles.inputWrapDark : null]}>
          <TextInput
            style={[styles.input, dark ? styles.inputDark : null]}
            value={input}
            onChangeText={setInput}
            placeholder="Envía un mensaje a tu Mac..."
            placeholderTextColor={dark ? '#8e8e93' : '#9d9da3'}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            multiline
          />
          <Pressable
            style={[styles.send, (!connected || busy) && styles.sendDisabled]}
            onPress={() => send()}
            disabled={!connected || busy}>
            {busy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.sendText}>▲</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <ChatScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  containerDark: { backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  headerDark: { backgroundColor: '#000000', borderBottomColor: '#2c2c2e' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#10a37f',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoText: { fontSize: 18 },
  title: { fontSize: 17, fontWeight: '700', color: '#1d1d1f' },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pillOn: { backgroundColor: '#34c759' },
  pillOff: { backgroundColor: '#ff9500' },
  statusPillText: { fontSize: 11, color: '#ffffff', fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  reconnect: {
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ff9500',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  newChat: {
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5ea',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipDark: { backgroundColor: '#2c2c2e', borderColor: '#3a3a3c' },
  newChatText: { color: '#1d1d1f', fontSize: 13, fontWeight: '600' },
  welcome: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  welcomeTitle: { fontSize: 22, fontWeight: '700', color: '#1d1d1f', marginBottom: 8 },
  welcomeSub: { fontSize: 14, color: '#6e6e73', lineHeight: 20 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 24 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5ea',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputWrapDark: { backgroundColor: '#000000', borderTopColor: '#2c2c2e' },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f7',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: '#1d1d1f',
    maxHeight: 120,
    marginRight: 8,
  },
  inputDark: { backgroundColor: '#2c2c2e', color: '#ffffff' },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10a37f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#c7c7cc' },
  sendText: { color: '#ffffff', fontSize: 15 },
  textDark: { color: '#ffffff' },
});

export default App;