import React, { useEffect, useRef } from 'react';
import { GlobalState, globalStore} from '../stores/global';
import { RoomState, roomStore} from '../stores/room';
import {ErrorState, errorStore} from '../pages/error-page/state';
import { WhiteboardState, whiteboard } from '../stores/whiteboard';
import { useHistory, useLocation } from 'react-router-dom';
import { resolveMessage, resolvePeerMessage, jsonParse } from '../utils/helper';
import GlobalStorage from '../utils/custom-storage';
import {eduApi} from '../services/edu-api';
import { t } from '../i18n';
import { ChatCmdType } from '../utils/agora-rtm-client';
export type IRootProvider = {
  globalState: GlobalState
  roomState: RoomState
  whiteboardState: WhiteboardState
  errorState: ErrorState
}

export interface IObserver<T> {
  subscribe: (setState: (state: T) => void) => void
  unsubscribe: () => void
  defaultState: T
}

function useObserver<T>(store: IObserver<T>) {
  const [state, setState] = React.useState<T>(store.defaultState);
  React.useEffect(() => {
    store.subscribe((state: any) => {
      setState(state);
    });
    return () => {
      store.unsubscribe();
    }
  }, []);

  return state;
}


export const RootContext = React.createContext({} as IRootProvider);

export const useStore = () => {
  const context = React.useContext(RootContext)
  if (context === undefined) {
    throw new Error('useStore must be used within a RootProvider');
  }
  return context;
}

export const useGlobalState = () => {
  return useStore().globalState;
}

export const useRoomState = () => {
  return useStore().roomState;
}

export const useWhiteboardState = () => {
  return useStore().whiteboardState;
}

export const useErrorState = () => {
  return useStore().errorState;
}

export const RootProvider: React.FC<any> = ({children}) => {
  const globalState = useObserver<GlobalState>(globalStore);
  const roomState = useObserver<RoomState>(roomStore);
  const whiteboardState = useObserver<WhiteboardState>(whiteboard);
  const errorState = useObserver<ErrorState>(errorStore);
  const history = useHistory();

  const ref = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      ref.current = true;
    }
  }, []);

  const value = {
    globalState,
    roomState,
    whiteboardState,
    errorState,
  }

  useEffect(() => {
    if (!roomStore.state.rtm.joined) return;
    const rtmClient = roomStore.rtmClient;
    rtmClient.on('ConnectionStateChanged', ({ newState, reason }: { newState: string, reason: string }) => {
      console.log(`newState: ${newState} reason: ${reason}`);
      if (reason === 'LOGIN_FAILURE') {
        globalStore.showToast({
          type: 'rtmClient',
          message: t('toast.login_failure'),
        });
        history.push('/');
        return;
      }
      if (reason === 'REMOTE_LOGIN' || newState === 'ABORTED') {
        globalStore.showToast({
          type: 'rtmClient',
          message: t('toast.kick'),
        });
        history.push('/');
        return;
      }
    });
    rtmClient.on("MessageFromPeer", ({ message: { text }, peerId, props }: { message: { text: string }, peerId: string, props: any }) => {
      const body = resolvePeerMessage(text);
      // resolveMessage(peerId, body);
      roomStore
      .handlePeerMessage(body, peerId)
      .then(() => {
      }).catch(console.warn);
    });
    rtmClient.on("ChannelMessage", ({ memberId, message }: { message: { text: string }, memberId: string }) => {
      const {cmd, data} = jsonParse(message.text);
      console.log("ChannelMessage cmd:  ", cmd, data)
      // chat message
      // 聊天消息
      if (cmd === ChatCmdType.chat) {
        const isChatroom = globalStore.state.active === 'chatroom';
        if (!isChatroom) {
          globalStore.setMessageCount(globalStore.state.newMessageCount+1);
        } else {
          globalStore.setMessageCount(0);
        }
        const chatMessage = {
          account: data.account,
          text: data.content,
          ts: +Date.now(),
          id: memberId,
        }
        roomStore.updateChannelMessage(chatMessage);
        console.log("[rtmClient] chatMessage ", chatMessage, " raw Data: ", data);
      }

      // replay message
      // 回放消息
      if (cmd === ChatCmdType.replay) {
        const isChatroom = globalStore.state.active === 'chatroom';
        if (!isChatroom) {
          globalStore.setMessageCount(globalStore.state.newMessageCount+1);
        } else {
          globalStore.setMessageCount(0);
        }
        const replayMessage = {
          account: data.account,
          text: data.content,
          link: data.recordId,
          ts: +Date.now(),
          id: memberId,
        }
        roomStore.updateChannelMessage(replayMessage);
        console.log("[rtmClient] replayMessage", replayMessage, " raw Data: ", data);
      }

      // user message
      // 用户消息
      if (cmd === ChatCmdType.update) {
        roomStore.fetchRoomState()
          .then(() => {
            console.log('fetchRoomState')
          }).catch(console.warn)
      }

      // 课程消息
      // course message
      if (cmd === ChatCmdType.course) {
        roomStore.fetchCourse()
        .then(() => {
          console.log('fetchCourse')
        }).catch(console.warn)
      }
    });
    return () => {
      rtmClient.removeAllListeners();
    }
  }, [roomStore.state.rtm.joined]);

  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/') {
      return;
    }

    const room = value.roomState;
    GlobalStorage.save('agora_room', {
      me: room.me,
      course: room.course,
      mediaDevice: room.mediaDevice,
      applyUser: room.applyUser,
    });
    GlobalStorage.setLanguage(value.globalState.language);
    // WARN: DEBUG ONLY MUST REMOVED IN PRODUCTION
    //@ts-ignore
    window.errorState = errorState;
    //@ts-ignore
    window.room = roomState;
    //@ts-ignore
    window.globalState = globalState;
    //@ts-ignore
    window.whiteboard = whiteboardState;
  }, [value, location]);
  return (
    <RootContext.Provider value={value}>
      {children}
    </RootContext.Provider>
  )
}