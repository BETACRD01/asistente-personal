import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatMessage, HubClient } from './src/api/hubClient';
import { DEVICE_NAME } from './src/config';

function ChatScreen() {
  const insets = useSafeAreaInsets();
  const clientRef = useRef<HubClient | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Conectando...');
  const [connected, setConnected] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const streamingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const client = new HubClient();
    clientRef.current = client;

    client
      .login()
      .then(() => {
        client.setMessageHandler(message => {
          handleMessage(message);
        });
        client.connect(DEVICE_NAME);
      })
      .catch(error => {
        setStatus(error.message);
      });

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, []);

  const handleMessage = useCallback((message: ChatMessage | any) => {
    if (message.type === 'connected') {
      setStatus('Conectado');
      setConnected(true);
      return;
    }
    if (message.type === 'reconnecting') {
      setStatus('Reconectando...');
      setConnected(false);
      return;
    }
    if (message.type === 'error') {
      setStatus(message.message || 'Error');
      setConnected(false);
      return;
    }
    if (message.type === 'token') {
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
        streamingIdRef.current = id;
        return [
          ...prev,
          { id, role: 'assistant', content: message.content ?? '', streaming: true },
        ];
      });
    }
    if (message.type === 'done' || message.type === 'error') {
      const id = message.id;
      if (message.type === 'error' && !messages.some(m => m.id === id)) {
        setMessages(prev => [
          ...prev,
          { id, role: 'assistant', content: message.message ?? 'Error', streaming: false },
        ]);
      }
      setMessages(prev =>
        prev.map(m => (m.id === id ? { ...m, streaming: false } : m)),
      );
      if (streamingIdRef.current === id) {
        streamingIdRef.current = null;
      }
    }
    if (message.type === 'stdout') {
      setStatus('Ejecutando en la Mac...');
    }
  }, []);

  const send = () => {
    const text = input.trim();
    if (!text || !connected) {
      return;
    }
    const id = `u${Date.now()}`;
    setMessages(prev => [...prev, { id, role: 'user', content: text }]);
    setInput('');
    clientRef.current?.sendCommand(DEVICE_NAME, text);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Asistente</Text>
        <View style={[styles.dot, connected ? styles.dotOn : styles.dotOff]} />
        <Text style={styles.status}>{status}</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.user : styles.assistant]}>
            <Text style={item.role === 'user' ? styles.userText : styles.assistantText}>
              {item.content}
              {item.streaming ? '▌' : ''}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Escribe un comando para tu Mac (ej: "abre Safari")</Text>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Escribe un comando..."
            placeholderTextColor="#8e8e93"
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable
            style={[styles.send, !connected && styles.sendDisabled]}
            onPress={send}
            disabled={!connected}>
            <Text style={styles.sendText}>➤</Text>
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
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#c7c7cc',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#000', marginRight: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  dotOn: { backgroundColor: '#34c759' },
  dotOff: { backgroundColor: '#ff3b30' },
  status: { fontSize: 13, color: '#8e8e93', flex: 1 },
  list: { flex: 1 },
  listContent: { padding: 16 },
  empty: { textAlign: 'center', color: '#8e8e93', marginTop: 40, fontSize: 14 },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
    marginBottom: 8,
  },
  user: { alignSelf: 'flex-end', backgroundColor: '#007aff' },
  assistant: { alignSelf: 'flex-start', backgroundColor: '#e5e5ea' },
  userText: { color: '#fff', fontSize: 15 },
  assistantText: { color: '#000', fontSize: 15 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#c7c7cc',
  },
  input: {
    flex: 1,
    backgroundColor: '#f2f2f7',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 15,
    color: '#000',
    marginRight: 8,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#c7c7cc' },
  sendText: { color: '#fff', fontSize: 16 },
});

export default App;