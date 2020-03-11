import { platform } from './../utils/platform';
import { AgoraElectronClient } from './../utils/agora-electron-client';
import { ChatMessage, AgoraStream } from '../utils/types';
import { Subject } from 'rxjs';
import { Map, Set, List } from 'immutable';
import AgoraRTMClient, { RoomMessage, ChatCmdType } from '../utils/agora-rtm-client';
import { globalStore } from './global';
import AgoraWebClient from '../utils/agora-rtc-client';
import { get, set, isEmpty } from 'lodash';
import { isElectron } from '../utils/platform';
import GlobalStorage from '../utils/custom-storage';
import { t } from '../i18n';
import { eduApi, UserAttrsParams } from '../services/edu-api';

export interface NotifyFlag {
  broad: boolean
}

export type LocalAttrs = Partial<AgoraUser & ClassState & {rawAccounts: any[]} & {broad: boolean}>;

export interface AgoraUser {
  uid: string
  account: string
  role: number
  video: number
  audio: number
  chat: number
  grantBoard: number
  coVideo: number // 当前是否为连麦状态
  userId: string // 仅用于服务端
  screenId: string //仅用于屏幕共享
}

export interface Me extends AgoraUser {
  rtmToken: string
  rtcToken: string
  channelName: string
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
  recordId: string
  recordingTime: number
  isRecording: boolean
  screenId: string
  screenToken: string
  coVideoUids: string[]
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

export type ApplyUser = {
  uid: string,
  userId: string,
  account: string,
}

export type RoomState = {
  rtmLock: boolean
  rtmToken: string
  rtcToken: string
  appID: string
  me: Me
  users: Map<string, AgoraUser>
  course: ClassState
  applyUser: ApplyUser
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
      coVideo: '',
    },
    users: Map<string, AgoraUser>(),
    applyUser: {
      userId: '',
      uid: '',
      account: '',
    },
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

  public applyLock: boolean = false;

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
    this.applyLock = false;
    this.subject.next(this.state);
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

  addRTCUser(uid: number) {
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

  async handlePeerMessage(body: any, peerId: string) {
    const {cmd, data: {userId, uid, operate, account}} = body
    // console.log("cmd ", cmd, "userId ", userId, " uid ", uid, " operate ", operate, " account ", account);

    if (!peerId) return console.warn('state is not assigned');
    const myUid = `${this.state.me.uid}`;
    // console.log("Teacher: ", this.isTeacher(myUid), ", peerId: ", this.isStudent(peerId), " myUid ", myUid, " peerId ", peerId, " userId ", userId);
    // student follow teacher peer message
    // 当对端是老师的时候
    if (!this.isTeacher(myUid) && this.isTeacher(peerId)) {
      const me = this.state.me;
      switch (operate) {
        case RoomMessage.rejectCoVideo: {
          globalStore.showToast({
            type: 'co-video',
            message: t("toast.teacher_reject_co_video")
          });
          return;
        }
        default:
      }
      return;
    }

    // when i m teacher & received student message
    // 当自己是老师的时候，处理学生的消息
    if (this.isTeacher(myUid) && this.isStudent(peerId)) {
      switch (operate) {
        case RoomMessage.applyCoVideo: {
          const applyUserId = userId

          if (applyUserId && peerId) {
            this.applyLock = true;
            this.state = {
              ...this.state,
              applyUser: {
                account: `${account}`,
                userId: `${applyUserId}`,
                uid: `${peerId}`,
              }
            }
            this.commit(this.state);
            globalStore.showNotice({
              reason: 'peer_hands_up',
              text: t('notice.student_interactive_apply', { reason: `${account}` }),
            });
            return
          }
        }
        default:
      }
      return;
    }
  }

  async mute(uid: string, type: string) {
    const me = this.state.me;
    if (`${me.uid}` === `${uid}`) {
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
      //     grantBoard: 0
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
    if (`${me.uid}` === `${uid}`) {
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
      //     grantBoard: 1
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
        onlineUsers
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
          userId: it.userId,
          coVideo: 1,
          screenId: it.screenId,
        });
      }, Map<string, AgoraUser>());

      console.log(">> res", course, me, users, appID)

      await this.rtmClient.login(appID, `${me.uid}`, me.rtmToken)
      console.log("login ", appID, course.channelName, me.rtmToken)
      await this.rtmClient.join(course.rid)
      if (me.coVideo) {
        await this.rtmClient.notifyMessage({
          cmd: ChatCmdType.update,
          data: {
            uid: `${me.uid}`,
            account: `${me.account}`,
            operate: RoomMessage.acceptCoVideo
          }
        })
      }
      this.state = {
        ...this.state,
        rtm: {
          ...this.state.rtm,
          joined: true,
          memberCount: +onlineUsers,
        },
        course: {
          ...this.state.course,
          rid: course.channelName,
          roomType: course.roomType,
          roomId: course.roomId,
          roomName: course.roomName,
          courseState: course.courseState,
          muteChat: course.muteAllChat,
          recordId: `${course.recordId}`,
          isRecording: course.isRecording,
          recordingTime: course.recordingTime,
          lockBoard: course.lockBoard,
          boardId: `${course.boardId}`,
          boardToken: `${course.boardToken}`,
          teacherId: `${course.teacherId}`,
          screenId: `${me.screenId}`,
          screenToken: `${me.screenToken}`,
          coVideoUids: course.coVideoUids,
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
          userId: me.userId,
          coVideo: me.coVideo,
        },
        users,
        appID,
      }
      console.log(">>>>>> res: ", res, " course", course.teacherId)
      this.commit(this.state)
    } catch(err) {
      if (this.rtmClient._logged) {
        await this.rtmClient.logout();
      }
      throw err;
    }
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

  async fetchCourse() {
    let course = await eduApi.getCourseState(this.state.course.roomId)
    return await this.updateCourse({...course, broad: false})
  }

  async fetchRoomState() {
    let {users, room} = await eduApi.getRoomState(this.state.course.roomId)
    return await this.updateRoomState({users, room, broad: false})
  }

  async updateRoomState(params: {users: Map<string, AgoraUser>, room: Partial<ClassState>} & NotifyFlag) {
    const {broad, users, room} = params

    const me = users.get(`${this.state.me.uid}`)

    const newMe = me

    this.state = {
      ...this.state,
      course: {
        ...this.state.course,
        ...room,
      },
      me: {
        ...this.state.me,
        ...newMe
      },
      users,
    }
    this.commit(this.state)
  }

  resolveUserAttrsToOperate(params: Partial<AgoraUser>): any {
    const keys = ['video', 'audio', 'chat', 'grantBoard', 'coVideo']
    for (let key of keys) {
      if (params.hasOwnProperty(key)) {
        let value = -1
        let stateValue = get(params, key, 0)
        let stateKey = key;
        if (key === 'video') {
          value = stateValue ? RoomMessage.unmuteVideo : RoomMessage.muteVideo
        } else if (key === 'audio') {
          value = stateValue ? RoomMessage.unmuteAudio : RoomMessage.muteAudio
        } else if (key === 'chat') {
          value = stateValue ? RoomMessage.unmuteChat : RoomMessage.muteChat
        } else if (key === 'grantBoard') {
          value = stateValue ? RoomMessage.unmuteBoard : RoomMessage.muteBoard
        } else if (key === 'coVideo') {
          value = stateValue ? RoomMessage.acceptCoVideo : RoomMessage.cancelCoVideo
        }
        return {
          key: stateKey,
          stateValue,
          value
        }
      }
    }
  }

  async updateLocalMe(params: Partial<Me & NotifyFlag>) {
    const {broad, ...meParams} = params
    const newMe = this.compositeMe(meParams)

    const newMeAttrs = {
      uid: newMe.uid,
      account: newMe.account,
      role: newMe.role,
      video: newMe.video,
      audio: newMe.audio,
      chat: newMe.chat,
      grantBoard: newMe.grantBoard,
      coVideo: newMe.coVideo,
      userId: newMe.userId,
      screenId: newMe.screenId,
    }

    const userAttrsParams: UserAttrsParams = {
      userId: newMeAttrs.userId as string,
      enableChat: newMeAttrs.chat as number,
      enableAudio: newMeAttrs.audio as number,
      enableVideo: newMeAttrs.video as number,
      grantBoard: newMeAttrs.grantBoard as number,
      coVideo: newMeAttrs.coVideo as number
    }

    if (broad) {
      await this.updateRoomUser({user: userAttrsParams})
    }

    this.state = {
      ...this.state,
      me: {
        ...this.state.me,
        ...newMeAttrs,
      },
      users: this.state.users.set(`${this.state.me.uid}`, newMeAttrs)
    }
    this.commit(this.state)

    const {value} = this.resolveUserAttrsToOperate(newMeAttrs)

    if (broad) {
      await this.rtmClient.notifyMessage({
        cmd: ChatCmdType.update,
        data: {
          uid: `${this.state.me.uid}`,
          account: `${this.state.me.account}`,
          operate: value,
        }
      })
    }
  }

  async updateRoomUser({user}: {user: UserAttrsParams}) {
    return await eduApi.updateRoomUser(user)
  }

  async updateApplyUserBy(applyUser: ApplyUser, params: any) {
    await eduApi.updateRoomUser({
      userId: applyUser.userId,
      coVideo: params.coVideo,
    })
    await this.rtmClient.notifyMessage({
      cmd: ChatCmdType.update,
      data: {
        userId: `${applyUser.userId}`,
        uid: `${applyUser.uid}`,
        account: `${applyUser.account}`,
        operate: RoomMessage.acceptCoVideo,
      }
    })
  }

  async updateUserBy(uid: string, params: Partial<AgoraUser & NotifyFlag>) {
    const {broad = true, ...userParams} = params
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

    const userAttrsParams: UserAttrsParams = {
      userId: newUserAttrs.userId as string,
      enableChat: newUserAttrs.chat as number,
      enableAudio: newUserAttrs.audio as number,
      enableVideo: newUserAttrs.video as number,
      grantBoard: newUserAttrs.grantBoard as number,
      coVideo: newUserAttrs.coVideo as number
    }

    console.log("newUserAttrs: ", newUserAttrs, userAttrsParams)

    if (broad) {
      await this.updateRoomUser({user: userAttrsParams})
    }

    this.state = {
      ...this.state,
      users: this.state.users.set(`${uid}`, newUserAttrs as AgoraUser)
    }
    this.commit(this.state)

    const {value} = this.resolveUserAttrsToOperate(newUserAttrs)

    if (broad) {
      await this.rtmClient.notifyMessage({
        cmd: ChatCmdType.update,
        data: {
          uid: `${this.state.me.uid}`,
          account: `${this.state.me.account}`,
          operate: value,
        }
      })
    }
  }

  resolveCourseAttrsToOperate(params: Partial<ClassState>): any {
    const keys = ['lockBoard', 'courseState', 'muteChat']
    for (let key of keys) {
      if (params.hasOwnProperty(key)) {
        let value = -1
        let stateValue = get(params, key, 0)
        let stateKey = key;
        if (key === 'lockBoard') {
          value = stateValue ? RoomMessage.lockBoard : RoomMessage.unlockBoard
        } else if (key === 'courseState') {
          value = stateValue ? RoomMessage.startCourse : RoomMessage.endCourse
        } else if (key === 'muteChat') {
          value = stateValue ? RoomMessage.muteAllChat : RoomMessage.unmuteAllChat
          stateKey = 'muteAllChat'
        }
        return {
          key: stateKey,
          stateValue,
          value
        }
      }
    }
  }

  async updateCourse(params: Partial<ClassState & NotifyFlag>) {
    const {broad = true, ...courseParams} = params

    const {key, stateValue, value}: any = this.resolveCourseAttrsToOperate(courseParams)

    if (broad) {
      await eduApi.updateCourse({
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
        }
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

  async startWebScreenShare() {
    const webClient = this.rtcClient as AgoraWebClient
    try {
      const {screenToken} = await eduApi.refreshToken();
      const {screenId, rid} = this.state.course
      const appId = this.state.appID
      await webClient.startScreenShare({
        uid: +screenId,
        token: screenToken,
        channel: rid,
        appId
      })
      // add screen client listener
      // 监听屏幕共享主要的事件
      webClient.shareClient.on('onTokenPrivilegeWillExpire', (evt: any) => {
        // WARN: IF YOU ENABLED APP CERTIFICATE, PLEASE SIGN YOUR TOKEN IN YOUR SERVER SIDE AND OBTAIN IT FROM YOUR OWN TRUSTED SERVER API
        const newToken = '';
        webClient.shareClient.renewToken(newToken);
      });
      webClient.shareClient.on('onTokenPrivilegeDidExpire', (evt: any) => {
        // WARN: IF YOU ENABLED APP CERTIFICATE, PLEASE SIGN YOUR TOKEN IN YOUR SERVER SIDE AND OBTAIN IT FROM YOUR OWN TRUSTED SERVER API
        const newToken = '';
        webClient.shareClient.renewToken(newToken);
      });
      webClient.shareClient.on('stopScreenSharing', (evt: any) => {
        console.log('stop screen share', evt);
        this.stopWebScreenShare().then(() => {
          globalStore.showToast({
            message: t('toast.canceled_screen_share'),
            type: 'notice'
          });
        }).catch(console.warn).finally(() => {
          console.log('[agora-web] stop share');
        })
      })
    } catch(err) {
      if (webClient.shareClient) {
        webClient.shareClient.off('onTokenPrivilegeWillExpire', (evt: any) => {})
        webClient.shareClient.off('onTokenPrivilegeDidExpire', (evt: any) => {})
        webClient.shareClient.off('stopScreenSharing', (evt: any) => {})
      }
      if (err.type === 'error' && err.msg === 'NotAllowedError') {
        globalStore.showToast({
          message: t('toast.canceled_screen_share'),
          type: 'notice'
        });
      }
      if (err.type === 'error' && err.msg === 'PERMISSION_DENIED') {
        globalStore.showToast({
          message: t('toast.screen_sharing_failed', {reason: err.msg}),
          type: 'notice'
        });
      }
      throw err
    }
  }

  async stopWebScreenShare() {
    const webClient = this.rtcClient as AgoraWebClient
    if (webClient.shared) {
      await webClient.stopScreenShare()
      this.removeLocalSharedStream();
    }
  }

  // WARN: only work in electron environment
  // 仅用于electron运行环境
  async startNativeScreenShare() {
    const rtcClient = this.rtcClient;
    globalStore.setNativeWindowInfo({
      visible: true,
      items: (rtcClient as AgoraElectronClient).getScreenShareWindows()
    })
  }

  async startScreenShare() {
    if (platform === 'electron') {
      await this.startNativeScreenShare()
    }

    if (platform === 'web') {
      await this.startWebScreenShare()
    }
  }

  async stopNativeScreenShare() {
    const nativeClient = this.rtcClient as AgoraElectronClient;
    if (nativeClient.shared) {
      await nativeClient.stopScreenShare();
    }
  }


  async stopScreenShare() {
    if (platform === 'web') {
      await this.stopWebScreenShare()
    }

    if (platform === 'electron') {
      await this.stopNativeScreenShare()
    }
  }

  async startRecording () {
    const {data: recordId} = await eduApi.startRecording()
    this.state = {
      ...this.state,
      course: {
        ...this.state.course,
        recordId,
        isRecording: true
      }
    }
    this.commit(this.state)
  }

  async stopRecording () {
    const {data} = await eduApi.stopRecording(this.state.course.recordId)
    const recordId = this.state.course.recordId
    this.state = {
      ...this.state,
      course: {
        ...this.state.course,
        recordId: '',
        isRecording: false
      }
    }
    this.commit(this.state)
    await this.rtmClient.sendRecordMessage({
      account: `${this.state.me.account}`,
      recordId: `${this.state.course.recordId}`
    })
  }
}

export const roomStore = new RoomStore();

//@ts-ignore
window.roomStore = roomStore;