import { AgoraFetch } from "../utils/fetch";
import { ClassState, AgoraUser } from "../stores/room";
import {Map} from 'immutable'
import { getIntlError, setIntlError } from "./intl-error-helper";
import { globalStore } from "../stores/global";

export interface UserAttrsParams {
  userId: string
  enableChat: number
  enableVideo: number
  enableAudio: number
  grantBoard: number
  coVideo: number
}

const PREFIX: string = process.env.REACT_APP_AGORA_EDU_ENDPOINT_PREFIX as string;

const AUTHORIZATION_KEY: string = process.env.REACT_APP_AGORA_ENDPOINT_AK as string;

const AgoraFetchJson = async ({url, method, data, token, authorization}:{url: string, method: string, data?: any, token?: string, authorization?: string}) => {

  let authKey: string = AUTHORIZATION_KEY

  if (authorization) {
    authKey = authorization
  }
  
  const opts: any = {
    method,
    headers: {
      'Content-Type': 'application/json',
    }
  }

  if (authKey) {
    opts.headers['Authorization'] = `Basic ${authKey}`
  }

  if (token) {
    opts.headers['token'] = token;
  }
  if (data) {
    opts.body = JSON.stringify(data);
  }

  let resp = await AgoraFetch(`${PREFIX}${url}`, opts);

  const {code, msg, data: responseData} = resp

  if (code !== 0) {
    const error = getIntlError(`${code}`)
    const isErrorCode = `${error}` === `${code}`
    globalStore.showToast({
      type: 'eduApiError',
      message: isErrorCode ? `ErrorCode: ${code}` : error
    })
    throw {api_error: error, isErrorCode}
  }

  return responseData
}

export interface EntryParams {
  userName: string
  roomName: string
  type: number
  role: number
}

export type RoomParams = Partial<{
  muteAllChat: boolean
  lockBoard: number
  courseState: number
  [key: string]: any
}>

export class AgoraEduApi {

  appID: string = '';
  authorization: string = '';
  roomId: string = '';
  userToken: string = '';
  recordId: string = '';

  // app config
  // 配置入口
  async config() {
    let data = await AgoraFetchJson({
      url: `/v1/config?platform=0&device=0&version=5.2.0`,
      method: 'GET',
    });

    if (data['multiLanguage']) {
      setIntlError(data['multiLanguage'])
    }

    return {
      appId: data.appId,
      authorization: data.authorization,
      room: data.room,
    }
  }

  // room entry
  // 房间入口
  async entry(params: EntryParams) {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/entry`,
      method: 'POST',
      data: params,
      authorization: this.authorization,
    });
    
    this.roomId = data.roomId;
    this.userToken = data.userToken;
    return {
      data
    }
  }

  // refresh token
  // 刷新token 
  async refreshToken() {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}/token/refresh`,
      method: 'POST',
      token: this.userToken,
      authorization: this.authorization,
    });
    return {
      rtcToken: data.rtcToken,
      rtmToken: data.rtmToken,
      screenToken: data.screenToken
    }
  }

  // update course
  // 更新课程状态
  async updateCourse(params: Partial<RoomParams>) {
    const {room} = params
    // const dataParams: any = {}
    // if (room) {
    //   dataParams.room = room
    // }
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}`,
      method: 'POST',
      data: room,
      token: this.userToken,
      authorization: this.authorization
    });
    return {
      data,
    }
  }

  // 即将废弃, 需要更改为@next
  // async updateRoomUser(params: Partial<RoomParams>) {
  //   const {user} = params
  //   const dataParams: any = {}
  //   if (user) {
  //     dataParams.users = [user]
  //   }
  //   let data = await AgoraFetchJson({
  //     url: `/v1/apps/${this.appID}/room/${this.roomId}`,
  //     method: 'POST',
  //     data: dataParams,
  //     token: this.userToken,
  //     authorization: this.authorization
  //   });
  //   return {
  //     data,
  //   }
  // }

  // @next
  // update users 
  // 更新用户状态，老师可更新房间内所有人，学生只能更新自己
  async updateRoomUser(user: Partial<UserAttrsParams>) {
    const {userId, ...userAttrs} = user
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}/user/${userId}`,
      method: 'POST',
      data: userAttrs,
      token: this.userToken,
      authorization: this.authorization
    });
    return {
      data,
    }
  }

  // start recording
  // 开始录制
  async startRecording() {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}/record/start`,
      method: 'POST',
      data: {},
      token: this.userToken,
      authorization: this.authorization,
    });
    this.recordId = data.recordId
    return {
      data
    }
  }

  // stop recording
  // 结束录制
  async stopRecording(recordId: string) {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}/record/${recordId}/stop`,
      method: 'POST',
      token: this.userToken,
      authorization: this.authorization,
    })
    return {
      data
    }
  }

  // get recording list
  // 获取录制列表
  async getRecordingList () {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}/records`,
      method: 'GET',
      token: this.userToken,
      authorization: this.authorization,
    })
    return {
      data
    }
  }

  // get room info
  // 获取房间信息
  async getRoomInfoBy(roomId: string): Promise<{data: any}> {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${roomId}`,
      method: 'GET',
      token: this.userToken,
      authorization: this.authorization,
    });
    return {
      data: {
        room: data.room,
        users: data.room.coVideoUsers,
        user: data.user
      }
    }
  }

  // getUsersState
  // 获取用户状态
  async getRoomState(roomId: string): Promise<{usersMap: Map<string, AgoraUser>, room: Partial<ClassState>}> {
    const {data} = await this.getRoomInfoBy(roomId)
    const {users: rawUsers, room: rawCourse} = data

    let usersMap: Map<string, AgoraUser> = rawUsers.reduce((acc: Map<string, AgoraUser>, it: any) => {
      return acc.set(`${it.uid}`, {
        role: it.role,
        account: it.userName,
        uid: it.uid,
        video: it.enableVideo,
        audio: it.enableAudio,
        chat: it.enableChat,
        grantBoard: it.grantBoard,
        userId: it.userId,
        screenId: it.screenId,
        coVideo: it.coVideo,
      });
    }, Map<string, AgoraUser>());

    const room: Partial<ClassState> = {
      courseState: rawCourse.courseState,
      muteChat: rawCourse.muteAllChat,
      isRecording: rawCourse.isRecording,
      boardId: rawCourse.boardId,
      boardToken: rawCourse.boardToken,
      lockBoard: rawCourse.lockBoard,
      teacherId: ''
    }

    const teacher = usersMap.find((it: AgoraUser) => it.role === 1)

    if (teacher) {
      room.teacherId = teacher.uid
    }

    return {
      usersMap,
      room
    }
  }

  // getCourseState
  // 获取房间状态
  async getCourseState(roomId: string): Promise<Partial<ClassState>> {
    const {data} = await this.getRoomInfoBy(roomId)
    const {users, room} = data

    const result: Partial<ClassState> = {
      roomName: room.roomName,
      roomId: room.roomId,
      courseState: room.courseState,
      roomType: room.type,
      muteChat: room.muteAllChat,
      recordId: room.recordId,
      recordingTime: room.recordingTime,
      isRecording: Boolean(room.isRecording),
      boardId: room.boardId,
      boardToken: room.boardToken,
      lockBoard: room.lockBoard,
    }

    const teacher = users.find((it: any) => it.role === 1)
    if (teacher) {
      result.teacherId = teacher.uid
      result.screenId = teacher.screenId
      result.screenToken = teacher.screenToken
    }

    return result
  }

  // login 登录教室
  async Login(params: EntryParams) {
    if (!this.appID) {
      let {appId, authorization} = await this.config()
      this.appID = appId
      this.authorization = authorization
    }
    if (!this.appID) throw `appId is empty: ${this.appID}`
    let {data: {roomId, userToken}} = await this.entry(params)

    const {data: {room, user, users: userList = []}} = await this.getRoomInfoBy(roomId)

    const me = user

    const teacherState = userList.find((user: any) => +user.role === 1)

    const course: any = {
      rid: room.channelName,
      roomName: room.roomName,
      channelName: room.channelName,
      roomId: room.roomId,
      roomType: room.type,
      courseState: room.courseState,
      muteAllChat: room.muteAllChat,
      isRecording: room.isRecording,
      recordId: room.recordId,
      recordingTime: room.recordingTime,
      boardId: room.boardId,
      boardToken: room.boardToken,
      lockBoard: room.lockBoard,
      teacherId: undefined
    }

    if (teacherState) {
      course.teacherId = +teacherState.uid
    }

    if (me.role === 1) {
      course.teacherId = me.uid
    }

    const coVideoUids = userList.map((it: any) => `${it.uid}`)

    if (course.teacherId && coVideoUids.length) {
      course.coVideoUids = coVideoUids.filter((uid: any) => `${uid}` !== `${course.teacherId}`)
    }

    const result = {
      course,
      me,
      users: userList,
      appID: this.appID,
      onlineUsers: room.onlineUsers,
    }

    return result
  }
}

export const eduApi = new AgoraEduApi();