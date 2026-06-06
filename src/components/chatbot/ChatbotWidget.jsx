import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, Loader2, MessageCircle, Send, Sprout, X } from 'lucide-react';
import { appClient } from '@/api/appClient';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const initialMessages = [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'Xin chào, tôi có thể hỗ trợ bạn xem nhanh dữ liệu cảm biến, thiết bị, cảnh báo và luật tự động hóa trong nhà kính.',
  },
];

const AUTO_PLANT_VALUE = 'auto';

function toApiMessages(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map(({ role, content }) => ({ role, content }))
    .slice(-8);
}

export default function ChatbotWidget() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [confirmingActionKey, setConfirmingActionKey] = useState('');
  const [executingActionKey, setExecutingActionKey] = useState('');
  const [completedActionKeys, setCompletedActionKeys] = useState({});
  const [selectedPlantId, setSelectedPlantId] = useState(AUTO_PLANT_VALUE);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const plantsQuery = useQuery({
    queryKey: ['chatbotPlants'],
    queryFn: appClient.chatbot.listPlants,
    enabled: isOpen,
    staleTime: 10_000,
  });
  const plants = Array.isArray(plantsQuery.data) ? plantsQuery.data : [];
  const isLoadingPlants = plantsQuery.isLoading || (plantsQuery.isFetching && plants.length === 0);
  const plantLoadError = plantsQuery.error?.message || '';

  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
    textareaRef.current?.focus();
  }, [isOpen, messages]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const content = input.trim();
    if (!content || isSending) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      const result = await appClient.chatbot.sendMessage({
        message: content,
        messages: toApiMessages(messages),
        ...(selectedPlantId !== AUTO_PLANT_VALUE ? { plantId: selectedPlantId } : {}),
      });

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.reply,
          actions: Array.isArray(result.deviceActions) ? result.deviceActions : [],
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: error.message || 'Không thể kết nối chatbot lúc này.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  const handleDeviceAction = async (messageId, action) => {
    const actionKey = `${messageId}:${action.id}`;

    if (confirmingActionKey !== actionKey) {
      setConfirmingActionKey(actionKey);
      return;
    }

    setExecutingActionKey(actionKey);

    try {
      const result = await appClient.chatbot.executeDeviceAction({
        deviceId: action.deviceId,
        action: action.action,
      });

      setCompletedActionKeys((current) => ({
        ...current,
        [actionKey]: result.message || 'Đã gửi lệnh thiết bị.',
      }));
      setConfirmingActionKey('');
      setMessages((current) => [
        ...current,
        {
          id: `device-action-${Date.now()}`,
          role: 'assistant',
          content: result.message || 'Đã gửi lệnh thiết bị.',
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `device-action-error-${Date.now()}`,
          role: 'assistant',
          content: error.message || 'Không thể gửi lệnh thiết bị lúc này.',
        },
      ]);
    } finally {
      setExecutingActionKey('');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <section className="flex h-[min(620px,calc(100vh-7rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
          <header className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">Trợ lý GreenHouse</h2>
                <p className="truncate text-xs text-muted-foreground">Gemini</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Đóng chatbot"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="border-b bg-background px-4 py-3">
            <div className="flex items-center gap-2">
              <Sprout className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Select
                value={selectedPlantId}
                onValueChange={setSelectedPlantId}
                disabled={isSending}
              >
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue placeholder="Chọn cây/khu vực" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_PLANT_VALUE}>Các cây đang trồng</SelectItem>
                  {isLoadingPlants && (
                    <SelectItem value="loading-plants" disabled>
                      Đang tải danh sách cây...
                    </SelectItem>
                  )}
                  {plants.map((plant) => (
                    <SelectItem key={plant.id} value={plant.id}>
                      {plant.location ? `${plant.location} - ${plant.plant_profile?.name || plant.name}` : plant.name}
                    </SelectItem>
                  ))}
                  {!isLoadingPlants && plantLoadError && (
                    <SelectItem value="plant-load-error" disabled>
                      Không tải được danh sách cây
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {plantLoadError && (
              <p className="mt-2 text-xs text-destructive">{plantLoadError}</p>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'border bg-background text-foreground',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  {Array.isArray(message.actions) && message.actions.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.actions.map((action) => {
                        const actionKey = `${message.id}:${action.id}`;
                        const isConfirming = confirmingActionKey === actionKey;
                        const isExecuting = executingActionKey === actionKey;
                        const completedMessage = completedActionKeys[actionKey];

                        return (
                          <div key={action.id} className="rounded-md border bg-background/80 p-2">
                            <p className="mb-2 text-xs text-muted-foreground">{action.reason}</p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={completedMessage ? 'secondary' : 'default'}
                                className="h-8 text-xs"
                                disabled={Boolean(completedMessage) || isExecuting}
                                onClick={() => handleDeviceAction(message.id, action)}
                              >
                                {isExecuting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                {completedMessage && <Check className="h-3.5 w-3.5" />}
                                {!isExecuting && !completedMessage && (isConfirming ? action.confirmLabel : action.label)}
                                {isExecuting && 'Đang gửi...'}
                                {completedMessage && 'Đã gửi'}
                              </Button>
                              {isConfirming && !completedMessage && !isExecuting && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs"
                                  onClick={() => setConfirmingActionKey('')}
                                >
                                  Hủy
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang trả lời...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t bg-background p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                maxLength={1200}
                placeholder="Hỏi về nhà kính..."
                className="min-h-10 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSending}
              />
              <Button
                type="submit"
                size="icon"
                title="Gửi tin nhắn"
                disabled={isSending || !input.trim()}
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </section>
      )}

      <Button
        type="button"
        size="icon"
        title="Mở chatbot"
        className="h-12 w-12 rounded-full shadow-lg"
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </Button>
    </div>
  );
}
