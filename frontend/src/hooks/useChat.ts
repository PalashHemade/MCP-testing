import { useMutation } from '@tanstack/react-query'
import { sendChatMessage } from '../api/chat'

export function useChatMutation(demoUser: string) {
  return useMutation({
    mutationFn: (message: string) => sendChatMessage(message, demoUser),
  })
}
