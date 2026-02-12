import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, X, Bot } from 'lucide-react';
import { useAppStore } from '../store';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: ChatAction[];
}

interface ChatAction {
  type: 'button';
  label: string;
  action: string;
  data?: any;
}

const ChatWidget: React.FC = () => {
  const { chatOpen, toggleChat } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hi! I\'m your eBay Sync assistant. I can help you sync products, check status, manage orders, and much more. What would you like to do?',
      timestamp: new Date(),
      actions: [
        { type: 'button' as const, label: 'Sync Products', action: 'sync_products' },
        { type: 'button' as const, label: 'Check Status', action: 'check_status' },
        { type: 'button' as const, label: 'View Orders', action: 'view_orders' },
      ],
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate AI response (replace with actual API call later)
    setTimeout(() => {
      const responses = [
        {
          content: "I understand you want to sync products. Let me check the current status and help you with that.",
          actions: [
            { type: 'button' as const, label: 'Sync All Products', action: 'sync_all_products' },
            { type: 'button' as const, label: 'Sync Specific Category', action: 'sync_category' },
          ],
        },
        {
          content: "I can help you check the sync status. Currently showing idle status with recent activity.",
          actions: [
            { type: 'button' as const, label: 'View Full Status', action: 'view_status' },
            { type: 'button' as const, label: 'Refresh Data', action: 'refresh_data' },
          ],
        },
        {
          content: "I can analyze your listings and suggest improvements. What would you like me to focus on?",
          actions: [
            { type: 'button' as const, label: 'Check Stale Listings', action: 'check_stale' },
            { type: 'button' as const, label: 'Performance Analysis', action: 'analyze_performance' },
          ],
        },
      ];

      const randomResponse = responses[Math.floor(Math.random() * responses.length)];

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: randomResponse.content,
        timestamp: new Date(),
        actions: randomResponse.actions,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleAction = (action: ChatAction) => {
    const actionMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: `Clicked: ${action.label}`,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, actionMessage]);

    // Simulate action response
    setTimeout(() => {
      let responseContent = '';
      switch (action.action) {
        case 'sync_products':
        case 'sync_all_products':
          responseContent = 'Initiating product sync... I\'ll update you with progress.';
          break;
        case 'check_status':
        case 'view_status':
          responseContent = 'Current status: ✅ Shopify connected, ✅ eBay connected, 📦 23 products mapped, 🚀 Ready to sync';
          break;
        case 'view_orders':
          responseContent = 'Recent orders: 12 imported today, 3 pending fulfillment, $1,247 total revenue';
          break;
        default:
          responseContent = 'Action received! This feature is coming soon in the full implementation.';
      }

      const responseMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, responseMessage]);
    }, 800);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-widget">
      {/* Chat Panel */}
      {chatOpen && (
        <div className="chat-panel animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-shopify-500 text-white rounded-t-lg">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <span className="font-medium">eBay Sync Assistant</span>
            </div>
            <button
              onClick={toggleChat}
              className="text-white hover:bg-shopify-600 p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="h-96 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                    message.role === 'user'
                      ? 'bg-shopify-500 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p>{message.content}</p>
                  {message.actions && (
                    <div className="mt-2 space-y-1">
                      {message.actions.map((action, index) => (
                        <button
                          key={index}
                          onClick={() => handleAction(action)}
                          className="block w-full text-left px-2 py-1 text-xs bg-white text-gray-700 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    className={`text-xs mt-1 ${
                      message.role === 'user' ? 'text-shopify-200' : 'text-gray-500'
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3 justify-start">
                <div className="bg-gray-100 text-gray-900 max-w-xs px-3 py-2 rounded-lg text-sm">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about your eBay sync..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-shopify-500 focus:ring-1 focus:ring-shopify-500"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                className="px-3 py-2 bg-shopify-500 text-white rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-shopify-600 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Press Enter to send, Shift+Enter for new line
            </div>
          </div>
        </div>
      )}

      {/* Chat Bubble */}
      <button onClick={toggleChat} className="chat-bubble">
        <MessageCircle className="w-6 h-6" />
        {!chatOpen && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-bounce-subtle"></div>
        )}
      </button>
    </div>
  );
};

export default ChatWidget;