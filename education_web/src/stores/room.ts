import { platform } from './../utils/platform';
import { AgoraElectronClient } from './../utils/agora-electron-client';
import { ChatMessage, AgoraStream } from '../utils/types';
import { Subject } from 'rxjs';
import { Map, Set, List } from 'immutable';
import AgoraRTMClient, { RoomMessage, ChatCmdType, CourseMessage } from '../utils/agora-rtm-client';
import { globalStore } from './global';
import AgoraWebClient from '../utils/agora-rtc-client';
import { get, set, isEmpty } from 'lodash';
import { isElectron } from '../utils/platform';
import GlobalStorage from '../utils/custom-storage';
import { t } from '../i18n';
import { jsonParse } from '../utils/helper';
import { eduApi } from '../services/edu-api';

export interface NotifyFlag {
  broad: boolean
}

export type LocalAttrs = Partial<AgoraUser & ClassState & {rawAccounts: any[]} & {broad: boolean}>;

export type ChannelAttrs = {
  uid: string
  account: string
  role: string
  video: number
  audio: number
  chat: number
  grant_board: number
  class_state?: number
  mute_chat?: number
  whiteboard_uid?: string
  shared_uid?: number 
  link_uid?: number
  lock_board?: number
};
export interface AgoraUser {
  uid: string
  account: string
  role: number
  video: number
  audio: number
  chat: number
  boardId: string // whiteboard_uuid
  // sharedId: number // shared_uid
  // linkId: number // link_uid
  // lockBoard: number // lock_board
  grantBoard: number
  coVideo: number
}

export interface Me extends AgoraUser {
  rtmToken: string
  rtcToken: string
  channelName: string
  screenId?: number
  screenToken?: string
  appID: string
}

export interface ClassState {
  rid: string
  roomName: string
  teacherId: string
  boardId: string // whiteboard_uuid
  boardToken: string // whiteboard_token
  // edu roomId
  // 房间id
  roomId: string

  // edu roomType
  // 房间类型
  roomType: number

  // lock board
  // 锁定
  lockBoard: number // lock_board

  // start class
  // 开始上课
  courseState: number
  // mute all chat
  // 全员禁言
  muteChat: number
  // recording 
  recordId: number
  recordingTime: number
  isRecording: boolean
  screenId: number
  screenToken: string
}

type RtcState = {
  published: boolean
  joined: boolean
  users: Set<number>
  shared: boolean
  localStream: AgoraMediaStream | null
  localSharedStream: AgoraMediaStream | null
  remoteStreams: Map<string, AgoraMediaStream>
}

export type MediaDeviceState = {
  microphoneId: string
  speakerId: string
  cameraId: string
  speakerVolume: number
  camera: number
  microphone: number
  speaker: number
}

export type SessionInfo = {
  uid: string
  rid: string
  account: string
  roomName: string
  roomType: number
  role: string
}

export type RtmState = {
  joined: boolean
  memberCount: number
}

export type RoomState = {
  rtmLock: boolean
  rtmToken: string
  rtcToken: string
  appID: string
  me: Me
  users: Map<string, AgoraUser>
  course: ClassState
  applyUid: number
  rtc: RtcState
  rtm: RtmState
  mediaDevice: MediaDeviceState
  messages: List<ChatMessage>
  language: string
}

export type AgoraMediaStream = {
  streamID: number
  stream?: any
}

export class RoomStore {
  private subject: Subject<RoomState> | null;
  public _state: RoomState;

  get state() {
    return this._state;
  }

  set state(newState) {
    this._state = newState;
  }
  public readonly defaultState: RoomState = Object.freeze({
    rtmLock: false,
    rtcToken: '',
    rtmToken: '',
    appID: '',
    me: {
      account: "",
      uid: "",
      roomToken: "",
      role: 0,
      video: 1,
      audio: 1,
      chat: 1,
      grantBoard: 0,
      rtmToken: '',
      rtcToken: '',
      appID: '',
    },
    users: Map<string, AgoraUser>(),
    applyUid: 0,
    rtm: {
      joined: false,
      memberCount: 0,
    },
    rtc: {
      published: false,
      joined: false,
      shared: false,
      users: Set<number>(),
      localStream: null,
      localSharedStream: null,
      remoteStreams: Map<string, AgoraMediaStream>(),
    },
    course: {
      teacherId: '',
      boardId: '',
      boardToken: '',
      courseState: 0,
      muteChat: 0,
      isRecording: false,
      recordId: '',
      recordingTime: 0,
      rid: '',
      roomName: '',
      roomType: 0,
      lockBoard: 0,
      roomId: '',
      screenId: '',
      screenToken: ''
    },
    mediaDevice: {
      microphoneId: '',
      speakerId: '',
      cameraId: '',
      speakerVolume: 100,
      camera: 0,
      speaker: 0,
      microphone: 0
    },
    messages: List<ChatMessage>(),
    language: navigator.language,
    ...GlobalStorage.read('agora_room')
  });

  private applyLock: number = 0;

  public windowId: number = 0;

  // public rtmClient: AgoraRTMClient = new AgoraRTMClient();
  // public rtcClient: AgoraWebClient | AgoraElectronClient = isElectron ? new AgoraElectronClient() : new AgoraWebClient();

  public rtmClient: AgoraRTMClient;
  public rtcClient: AgoraWebClient | AgoraElectronClient;

  constructor() {
    this.subject = null;
    this._state = {
      ...this.defaultState
    };
    this.rtmClient = new AgoraRTMClient();
    this.rtcClient = isElectron ? new AgoraElectronClient ({roomStore: this}) : new AgoraWebClient({roomStore: this});
  }

  initialize() {
    this.subject = new Subject<RoomState>();
    this.state = {
      ...this.defaultState,
    }
    this.applyLock = 0;
    this.subject.next(this.state);
  }

  get applyUid() {
    return this.applyLock;
  }

  subscribe(updateState: any) {
    this.initialize();
    this.subject && this.subject.subscribe(updateState);
  }

  unsubscribe() {
    this.subject && this.subject.unsubscribe();
    this.subject = null;
  }

  commit(state: RoomState) {
    this.subject && this.subject.next(state);
  }

  updateState(rootState: RoomState) {
    this.state = {
      ...this.state,
      ...rootState,
    }
    this.commit(this.state);
  }

  isTeacher(peerId: string) {
    if (!peerId
      || !this.state.course.teacherId
      || this.state.course.teacherId !== peerId
    ) return false;
    return true;
  }

  isStudent(peerId: string) {
    if (!peerId
      || this.state.course.teacherId === peerId
    ) return false;

    return true;
  }

  addLocalStream(stream: AgoraStream) {
    this.state = {
      ...this.state,
      rtc: {
        ...this.state.rtc,
        localStream: stream
      }
    }
    this.commit(this.state);
  }

  removeLocalStream() {
    this.state = {
      ...this.state,
      rtc: {
        ...this.state.rtc,
        localStream: null,
        localSharedStream: null
      }
    }
    this.commit(this.state);
  }

  addLocalSharedStream(stream: any) {
    this.state = {
      ...this.state,
      rtc: {
        ...this.state.rtc,
        localSharedStream: stream
      }
    }
    this.commit(this.state);
  }

  removeLocalSharedStream() {
    this.state = {
      ...this.state,
      rtc: {
        ...this.state.rtc,
        localSharedStream: null
      }
    }
    this.commit(this.state);
  }

  addPeerUser(uid: number) {
    this.state = {
      ...this.state,
      rtc: {
        ...this.state.rtc,
        users: this.state.rtc.users.add(uid),
      }
    }
    this.commit(this.state);
  }

  removePeerUser(uid: number) {
    this.state = {
      ...this.state,
      rtc: {
        ...this.state.rtc,
        users: this.state.rtc.users.delete(uid),
      }
    }
    this.commit(this.state);
  }

  addRemoteStream(stream: AgoraStream) {
    this.state = {
      ...this.state,
      rtc: {
        ...this.state.rtc,
        remoteStreams: this.state.rtc.remoteStreams.set(`${stream.streamID}`, stream)
      }
    }
    this.commit(this.state);
  }

  removeRemoteStream(uid: number) {
    const remoteStream = this.state.rtc.remoteStreams.get(`${uid}`);
    if (platform === 'web') {
      if (remoteStream && remoteStream.stream && remoteStream.stream.isPlaying) {
        remoteStream.stream.isPlaying() && remoteStream.stream.stop();
      }
    }

    this.state = {
      ...this.state,
      rtc: {
        ...this.state.rtc,
        remoteStreams: this.state.rtc.remoteStreams.delete(`${uid}`)
      }
    }
    this.commit(this.state);
  }

  updateMemberCount(count: number) {
    this.state = {
      ...this.state,
      rtm: {
        ...this.state.rtm,
        memberCount: count,
      }
    }
    this.commit(this.state);
  }

  updateRtc(newState: any) {
    this.state = {
      ...this.state,
      rtc: {
        ...this.state.rtc,
        ...newState,
      }
    }
    this.commit(this.state);
  }

  updateDevice(state: MediaDeviceState) {
    this.state = {
      ...this.state,
      mediaDevice: state
    }
    this.commit(this.state);
  }

  async handlePeerMessage(cmd: RoomMessage, peerId: string) {
    if (!peerId) return console.warn('state is not assigned');
    const myUid = this.state.me.uid;
    console.log("Teacher: ", this.isTeacher(myUid), ", peerId: ", this.isStudent(peerId), " myUid ", myUid, " peerId ", peerId);
    // student follow teacher peer message
    if (!this.isTeacher(myUid) && this.isTeacher(peerId)) {

      const me = this.state.me;
      switch (cmd) {
        case RoomMessage.muteChat: {
          return await this.updateLocalMe({ chat: 0, broad: true });
        }
        case RoomMessage.muteAudio: {
          return await this.updateLocalMe({ audio: 0, broad: true });
        }
        case RoomMessage.muteVideo: {
          return await this.updateLocalMe({ video: 0, broad: true });
        }
        case RoomMessage.muteBoard: {
          globalStore.showToast({
            type: 'notice',
            message: t('toast.teacher_cancel_whiteboard'),
          });
          return await this.updateLocalMe({ grantBoard: 0, broad: true });
        }
        case RoomMessage.unmuteAudio: {
          return await this.updateLocalMe({ audio: 1, broad: true });
        }
        case RoomMessage.unmuteVideo: {
          return await this.updateLocalMe({ video: 1, broad: true });
        }
        case RoomMessage.unmuteChat: {
          return await this.updateLocalMe({ chat: 1, broad: true });
        }
        case RoomMessage.unmuteBoard: {
          globalStore.showToast({
            type: 'notice',
            message: t('toast.teacher_accept_whiteboard')
          });
          return await this.updateLocalMe({ grantBoard: 1, broad: true});
        }
        case RoomMessage.acceptCoVideo: {
          globalStore.showToast({
            type: 'co-video',
            message: t("toast.teacher_accept_co_video")
          });
          await this.updateLocalMe({broad: true});
          console.log("setchannelAttrs succes")
          return;
        }
        case RoomMessage.rejectCoVideo: {
          globalStore.showToast({
            type: 'co-video',
            message: t("toast.teacher_reject_co_video")
          });
          return;
        }
        case RoomMessage.cancelCoVideo: {
          globalStore.showToast({
            type: 'co-video',
            message: t("toast.teacher_cancel_co_video")
          });
          return;
        }
        default:
      }
      return;
    }

    // when i m teacher & received student message
    if (this.isTeacher(myUid) && this.isStudent(peerId)) {
      switch (cmd) {
        case RoomMessage.applyCoVideo: {
          // TODO: 这里linkId是用于控制是否能举手的
          // TODO: 你可以按照业务代替linkId属性
          // if (this.state.course.linkId) {
          //   return console.warn('already received apply id: ', this.applyLock);
          // }
          // const applyUser = roomStore.state.users.get(`${peerId}`);
          // if (peerId) {
          const applyUid = +peerId

          if (typeof applyUid && !isNaN(applyUid)) {
            this.applyLock = +peerId;
            console.log("applyUid: ", this.applyLock);
            this.state = {
              ...this.state,
              applyUid: this.applyLock,
            }
            this.commit(this.state);
            globalStore.showNotice({
              reason: 'peer_hands_up',
              text: t('notice.student_interactive_apply', { reason: `学生 uid:${this.state.applyUid}` }),
            });
            return
          }
        }
        case RoomMessage.cancelCoVideo: {
          // WARN: LOCK
          await roomStore.updateCourseLinkUid(0)
          console.log("cancelCoVideo updateLinkUid, 0")
          globalStore.showToast({
            type: 'co-video',
            message: t('toast.student_cancel_co_video')
          });
          return;
        }
        default:
      }
      return;
    }
  }

  async mute(uid: string, type: string) {
    const me = this.state.me;
    if (me.uid === `${uid}`) {
      if (type === 'audio') {
        await this.updateLocalMe({
          audio: 0,
          broad: true
        });
      }
      if (type === 'video') {
        await this.updateLocalMe({
          video: 0,
          broad: true
        });
      }
      if (type === 'chat') {
        await this.updateLocalMe({
          chat: 0,
          broad: true
        });
      }
      // if (type === 'grantBoard') {
      //   await this.updateLocal({
      //     grant_board: 0
      //   });
      // }
    }
    else if (me.role === 1) {
      if (type === 'audio') {
        await this.updateUserBy(`${uid}`, {audio: 0});
      }
      if (type === 'video') {
        await this.updateUserBy(`${uid}`, {video: 0});
      }
      if (type === 'chat') {
        await this.updateUserBy(`${uid}`, {chat: 0});
      }
      if (type === 'grantBoard') {
        await this.updateUserBy(`${uid}`, {grantBoard: 0});
      }
    }
  }

  async unmute(uid: string, type: string) {
    const me = this.state.me;
    if (me.uid === `${uid}`) {
      if (type === 'audio') {
        await this.updateLocalMe({
          audio: 1,
          broad: true
        });
      }
      if (type === 'video') {
        await this.updateLocalMe({
          video: 1,
          broad: true
        });
      }
      if (type === 'chat') {
        await this.updateLocalMe({
          chat: 1,
          broad: true
        });
      }
      // if (type === 'grantBoard') {
      //   await this.updateLocal({
      //     grant_board: 1
      //   });
      // }
    }
    else if (me.role === 1) {
      if (type === 'audio') {
        await this.updateUserBy(`${uid}`, {audio: 1});
      }
      if (type === 'video') {
        await this.updateUserBy(`${uid}`, {video: 1});
      }
      if (type === 'chat') {
        await this.updateUserBy(`${uid}`, {chat: 1});
      }
      if (type === 'grantBoard') {
        await this.updateUserBy(`${uid}`, {grantBoard: 1});
      }
    }
  }

  async LoginToRoom(payload: any, pass: boolean = false) {
    const {userName, roomName, role, type} = payload
    try {
      const res = await eduApi.Login({userName, roomName, role, type})

      const {
        course,
        me,
        users: rawUsers,
        appID,
      } = res

      let users = rawUsers.reduce((acc: Map<string, AgoraUser>, it: any) => {
        return acc.set(`${it.uid}`, {
          role: it.role,
          account: it.userName,
          uid: it.uid,
          video: it.enableVideo,
          audio: it.enableAudio,
          chat: it.enableChat,
          grantBoard: it.grantBoard,
          boardId: it.boardId,
          // sharedId: it.screenId,
          coVideo: it.coVideo,
        });
      }, Map<string, AgoraUser>());

      console.log(">> res", course, me, users)

      await this.rtmClient.login(`${me.uid}`, me.rtmToken)
      await this.rtmClient.join(course.rid)
      this.state = {
        ...this.state,
        rtm: {
          ...this.state.rtm,
          joined: true
        },
        course: {
          ...this.state.course,
          rid: course.channelName,
          roomType: course.roomType,
          roomId: course.roomId,
          roomName: course.roomName,
          courseState: course.courseState,
          muteChat: course.muteAllChat,
          isRecording: course.isRecording,
          recordingTime: course.recordingTime,
          lockBoard: course.lockBoard,
          boardId: course.boardId,
          boardToken: course.boardToken,
          teacherId: course.teacherId,
        },
        me: {
          ...this.state.me,
          uid: me.uid,
          account: me.userName,
          rtmToken: me.rtmToken,
          rtcToken: me.rtcToken,
          channelName: me.channelName,
          screenId: me.screenId,
          screenToken: me.screenToken,
          appID: me.appID,
          role: me.role,
          chat: me.enableChat,
          video: me.enableVideo,
          audio: me.enableAudio,
        },
        users,
        appID,
      }

      console.log(">>>>>> res: ", res, " course", course.teacherId)
      this.commit(this.state)
      // this.updateLocal()
      // this.updateLocal()
    } catch(err) {
      if (this.rtmClient._logged) {
        await this.rtmClient.logout();
      }
      throw err;
    }
  }

  async updateToRoom(payload: any) {
    return await eduApi.updateRoom(payload)
  }

  exactRoomAttrsFrom({json}: any) {

    // const {course: prevCourseState, me: prevMeState, users: prevUsers} = this.state;

    const {me, course, users} = json;
    return {
      course,
      me,
      users
    }
  }

  async updateRoomAttrs(payload: any, local: boolean = false) {
    const {
      course, me, users
    } = this.exactRoomAttrsFrom(payload);


    const finalState = {
      ...this.state,
      course,
      me,
      users
    }

    if (local) {
      await this.updateToRoom(payload)
    }

    this.state = finalState
    this.commit(this.state)
  }

  setRTCJoined(joined: boolean) {
    this.state = {
      ...this.state,
      rtc: {
        ...this.state.rtc,
        joined
      }
    }
    this.commit(this.state);
  }

  async updateCourseLinkUid(linkId: number) {
    const me = this.state.me;
    // const prevLinkId = this.state.course.linkId
    // if (prevLinkId) {
    //   await this.deleteKey(prevLinkId)
    // }
    // let res = await this.updateLocal({
    //   linkId,
    // })
    // this.applyLock = linkId;
    // return res;
  }

  async updateWhiteboardUid(boardId: string) {
    let res = await this.updateLocal({
      boardId
    });
    console.log("[update whiteboard uuid] res", boardId);
    return res;
  }

  async deleteKey(uid: number) {
    this.rtmClient.deleteAttributesByKey(uid)
  }

  updateChannelMessage(msg: ChatMessage) {
    this.state = {
      ...this.state,
      messages: this.state.messages.push(msg)
    };

    this.commit(this.state);
  }

  private compositeMe(params: Partial<Me>): Me {
    console.log("compositeMe: ", params);
    const newMe: Me = { ...this.state.me };
    for (const prop in params) {
      if (newMe.hasOwnProperty(prop) && params.hasOwnProperty(prop)) {
        set(newMe, prop, get(params, prop, ''));
      }
    }
    return newMe;
  }

  private compositeCourse(params: Partial<ClassState>): ClassState {
    console.log("compositeCourse: ", params);
    const newCourse = { ...this.state.course };
    for (const prop in params) {
      if (newCourse.hasOwnProperty(prop) && params.hasOwnProperty(prop)) {
        set(newCourse, prop, get(params, prop, ''));
      }
    }
    return newCourse;
  }

  async updateUserBy(uid: string, params: Partial<AgoraUser & NotifyFlag>) {
    const {broad, ...userParams} = params
    const prevUser = this.state.users.get(`${uid}`)
    
    const newUserAttrs: Partial<AgoraUser> = {
      ...prevUser,
    }

    const userKeys = Object.keys(userParams)

    for (let key of userKeys) {
      if (newUserAttrs.hasOwnProperty(key)
        && userParams.hasOwnProperty(key)) {
        set(newUserAttrs, key, get(userParams, key))
      }
    }

    if (broad) {
      await this.updateToRoom({users: newUserAttrs})
    }

    this.state = {
      ...this.state,
      users: this.state.users.set(`${newUserAttrs.uid}`, newUserAttrs as AgoraUser)
    }
    this.commit(this.state)
  }

  async fetchCourse() {
    let course = await eduApi.getCourseState(this.state.course.roomId)
    return await this.updateCourse({...course, broad: false})
  }

  async updateLocalMe(params: Partial<Me & NotifyFlag>) {
    const {broad, ...meParams} = params
    const newMe = this.compositeMe(meParams)

    const newMeParams = {
      uid: newMe.uid,
      account: newMe.account,
      role: newMe.role,
      video: newMe.video,
      audio: newMe.audio,
      chat: newMe.chat,
      boardId: newMe.boardId,
      grantBoard: newMe.grantBoard,
      coVideo: newMe.coVideo,
    }

    if (broad) {
      await this.updateToRoom({users: [newMeParams]})
    }

    this.state = {
      ...this.state,
      me: {
        ...this.state.me,
        ...newMeParams,
      },
      users: this.state.users.set(`${this.state.me.uid}`, newMeParams)
    }
    this.commit(this.state)
  }

  async updateCourse(params: Partial<ClassState & NotifyFlag>) {
    const {broad = true, ...courseParams} = params

    const keys = ['lockBoard', 'courseState', 'muteChat']
    const resolveResource = (params: Partial<ClassState>): any => {
      for (let key of keys) {
        if (courseParams.hasOwnProperty(key)) {
          let value = -1
          let stateValue = get(params, key, 0)
          if (key === 'lockBoard') {
            value = stateValue ? RoomMessage.lockBoard : RoomMessage.unlockBoard
          } else if (key === 'courseState') {
            value = stateValue ? RoomMessage.startCourse : RoomMessage.endCourse
          } else if (key === 'muteChat') {
            value = stateValue ? RoomMessage.muteAllChat : RoomMessage.unmuteAllChat
          }
          return {
            key,
            stateValue,
            value
          }
        }
      }
    }

    const {key, stateValue, value}: any = resolveResource(courseParams)

    if (broad) {
      await eduApi.updateRoom({
        room: {
          [`${key}`]: stateValue
        }
      })
      this.state = {
        ...this.state,
        course: {
          ...this.state.course,
          ...courseParams
        }
      }
      this.commit(this.state)
      await this.rtmClient.notifyMessage({
        cmd: ChatCmdType.course,
        data: {
          operate: value,
        },
        enableHistoricalMessaging: false
      })
      return
    }
    this.state = {
      ...this.state,
      course: {
        ...this.state.course,
        ...courseParams
      }
    }
    this.commit(this.state)
  }

  async updateLocal(params: LocalAttrs) {
    const newMe = this.compositeMe(params)
    const newCourse = this.compositeCourse(params)
    const users = this.state.users

    this.state = {
      ...this.state,
      me: {
        ...newMe,
      },
      users,
      course: {
        ...newCourse,
      }
    }
    this.commit(this.state)
  }

  async exitAll() {
    try {
      try {
        await this.rtmClient.exit();
      } catch (err) {
        console.warn(err);
      }
      try {
        await this.rtcClient.exit();
      } catch (err) {
        console.warn(err);
      }
    } finally {
      GlobalStorage.clear('agora_room');
      this.state = {
        ...this.defaultState
      }
      this.commit(this.state);
    }
  }

  setScreenShare(shared: boolean) {
    this.state = {
      ...this.state,
      rtc: {
        ...this.state.rtc,
        shared,
      }
    }
    this.commit(this.state);
  }
}

export const roomStore = new RoomStore();

//@ts-ignore
window.roomStore = roomStore;