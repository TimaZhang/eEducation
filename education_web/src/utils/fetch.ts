const FETCH_TIMEOUT = 10000

const delay = 100;

export async function AgoraFetch (input: RequestInfo, init?: RequestInit, retryCount: number = 3): Promise<any> {
  return new Promise((resolve, reject) => {
    const onResponse = (response: Response) => {
      if (!response.ok) {
        reject(new Error(response.statusText))
      }
      return response.json().then(resolve).catch(reject)
    }

    const onError = (error: any) => {
      retryCount--;
      if (retryCount) {
        setTimeout(fetchRequest, delay);
      } else {
        reject(error);
      }
    }

    const rescueError = (error: any) => {
      console.warn(error)
      throw error;
    }

    function fetchRequest() {
      return fetch(input, init)
        .then(onResponse)
        .catch(onError)
        .catch(rescueError)
    }

    fetchRequest();

    if (FETCH_TIMEOUT) {
      const err = new Error("request timeout")
      setTimeout(reject, FETCH_TIMEOUT, err)
    }
  })
}