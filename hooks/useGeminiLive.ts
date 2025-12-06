import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../utils/audio';
import { ConnectionState, Message } from '../types';

const CONFLUENCE_WEBHOOK_URL = 'https://nexinodejs-364216224110.europe-west1.run.app/webhook/confluence-agent';

const confluenceTool: FunctionDeclaration = {
  name: 'ask_confluence_agent',
  description: 'Ask the Confluence Agent to read, summarize, or find information about spaces and pages in Confluence.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The natural language query or instruction for the Confluence agent.',
      },
    },
    required: ['query'],
  },
};

interface UseGeminiLiveReturn {
  connectionState: ConnectionState;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  messages: Message[];
  isVolumeActive: boolean; // Simple activity indicator
  currentVolume: number; // 0-1 normalized volume
}

export function useGeminiLive(): UseGeminiLiveReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentVolume, setCurrentVolume] = useState(0);

  // Audio Contexts & Nodes
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputNodeRef = useRef<ScriptProcessorNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Playback state
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  
  // Analysis
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const disconnect = useCallback(async () => {
    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (e) {
        console.error("Error closing session:", e);
      }
      sessionPromiseRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (inputNodeRef.current) {
      inputNodeRef.current.disconnect();
      inputNodeRef.current = null;
    }
    
    if (analyzerRef.current) {
      analyzerRef.current.disconnect();
      analyzerRef.current = null;
    }

    if (inputAudioContextRef.current) {
      await inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }

    if (outputAudioContextRef.current) {
      await outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setConnectionState(ConnectionState.DISCONNECTED);
    setCurrentVolume(0);
  }, []);

  const connect = useCallback(async () => {
    try {
      setConnectionState(ConnectionState.CONNECTING);
      setMessages([]);

      // 1. Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      // Try to use 16kHz for input to match Gemini Live requirements, though browser might override
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });

      // Analyzer for visualization
      analyzerRef.current = outputAudioContextRef.current.createAnalyser();
      analyzerRef.current.fftSize = 256;
      
      const outputNode = outputAudioContextRef.current.createGain();
      outputNode.connect(analyzerRef.current);
      analyzerRef.current.connect(outputAudioContextRef.current.destination);
      outputNodeRef.current = outputNode;

      // 2. Get Microphone Access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 3. Initialize Gemini Client
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, // Fenrir, Puck, Kore, Charon
          },
          systemInstruction: 'You are a helpful and efficient assistant connected to a Confluence knowledge base. When asked about documents, spaces, or summaries, use the provided tool to fetch information. If the tool returns an error, explain the issue politely to the user. Always speak the answer back to the user clearly.',
          tools: [{ functionDeclarations: [confluenceTool] }],
        },
      };

      // 4. Connect Live Session
      sessionPromiseRef.current = ai.live.connect({
        ...config,
        callbacks: {
          onopen: () => {
            console.log("Session opened");
            setConnectionState(ConnectionState.CONNECTED);
            
            // Start processing audio input
            if (!inputAudioContextRef.current || !streamRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromiseRef.current?.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
            inputNodeRef.current = scriptProcessor;
          },
          onmessage: async (message: LiveServerMessage) => {
             // Handle Tool Calls
             if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                  if (fc.name === 'ask_confluence_agent') {
                    const query = (fc.args as any).query;
                    setMessages(prev => [...prev, {
                      id: Math.random().toString(),
                      role: 'system',
                      text: `Querying Confluence: "${query}"...`,
                      timestamp: new Date()
                    }]);

                    try {
                      // Call the webhook
                      const response = await fetch(CONFLUENCE_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 
                          'Content-Type': 'application/json',
                          // Removing 'Accept' to reduce preflight complexity
                        },
                        // Sending both query and message to ensure compatibility with different agent inputs
                        body: JSON.stringify({ 
                          query: query,
                          message: query
                        }),
                        mode: 'cors',
                        credentials: 'omit'
                      });
                      
                      if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                      }

                      const responseText = await response.text();
                      let result = responseText;
                      // Try to parse if it's JSON to get a cleaner result field if possible
                      try {
                        const json = JSON.parse(responseText);
                        if (json.output) result = json.output;
                        else if (json.text) result = json.text;
                        else if (json.reply) result = json.reply;
                        else if (json.response) result = json.response;
                        else if (json.message) result = json.message;
                      } catch (e) {
                         // Use raw text if not JSON
                      }

                      sessionPromiseRef.current?.then(session => {
                        session.sendToolResponse({
                          functionResponses: {
                            id: fc.id,
                            name: fc.name,
                            response: { result: result }
                          }
                        });
                      });

                      setMessages(prev => [...prev, {
                        id: Math.random().toString(),
                        role: 'system',
                        text: `Confluence Replied.`,
                        timestamp: new Date()
                      }]);

                    } catch (err: any) {
                      console.error("Confluence Webhook Error:", err);
                      setMessages(prev => [...prev, {
                        id: Math.random().toString(),
                        role: 'system',
                        text: `Connection Error: ${err.message}`,
                        timestamp: new Date()
                      }]);

                      sessionPromiseRef.current?.then(session => {
                        session.sendToolResponse({
                          functionResponses: {
                            id: fc.id,
                            name: fc.name,
                            response: { error: `Failed to connect to Confluence Agent. Please try again. Error details: ${err.message}` }
                          }
                        });
                      });
                    }
                  }
                }
             }

             // Handle Audio Output
             const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio && outputAudioContextRef.current && outputNodeRef.current) {
                const ctx = outputAudioContextRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const audioBytes = decode(base64Audio);
                const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNodeRef.current);
                source.addEventListener('ended', () => {
                  sourcesRef.current.delete(source);
                });
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
             }

             // Handle Interruptions
             if (message.serverContent?.interrupted) {
               sourcesRef.current.forEach(s => s.stop());
               sourcesRef.current.clear();
               nextStartTimeRef.current = 0;
             }
          },
          onclose: () => {
            console.log("Session closed");
            setConnectionState(ConnectionState.DISCONNECTED);
          },
          onerror: (err) => {
            console.error("Session error:", err);
            setConnectionState(ConnectionState.ERROR);
            disconnect();
          }
        }
      });

      // Animation Loop for Volume Visualization
      const updateVolume = () => {
        if (analyzerRef.current) {
          const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
          analyzerRef.current.getByteFrequencyData(dataArray);
          
          // Average volume
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setCurrentVolume(avg / 255); // Normalize 0-1
        }
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

    } catch (error) {
      console.error("Connection failed:", error);
      setConnectionState(ConnectionState.ERROR);
      disconnect();
    }
  }, [disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connectionState,
    connect,
    disconnect,
    messages,
    isVolumeActive: currentVolume > 0.01,
    currentVolume
  };
}