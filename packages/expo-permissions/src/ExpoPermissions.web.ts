import {
  PermissionInfo,
  PermissionMap,
  PermissionStatus,
  PermissionType,
} from './Permissions.types';

/*
 * TODO: Bacon: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#Permissions
 * Add messages to manifest like we do with iOS info.plist
 */

// https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#Using_the_new_API_in_older_browsers
// Older browsers might not implement mediaDevices at all, so we set an empty object first
function _getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  // Some browsers partially implement mediaDevices. We can't just assign an object
  // with getUserMedia as it would overwrite existing properties.
  // Here, we will just add the getUserMedia property if it's missing.

  // First get ahold of the legacy getUserMedia, if present
  const getUserMedia =
    navigator.getUserMedia ||
    (navigator as any).webkitGetUserMedia ||
    (navigator as any).mozGetUserMedia ||
    function() {
      const error: any = new Error('Permission unimplemented');
      error.code = 0;
      error.name = 'NotAllowedError';
      throw error;
    };

  return new Promise((resolve, reject) => {
    getUserMedia.call(navigator, constraints, resolve, reject);
  });
}

async function askForMediaPermissionAsync(
  options: MediaStreamConstraints
): Promise<PermissionInfo> {
  try {
    await _getUserMedia(options);
    return { status: PermissionStatus.GRANTED, expires: 'never' };
  } catch ({ message }) {
    // name: NotAllowedError
    // code: 0
    if (message === 'Permission dismissed') {
      // message: Permission dismissed
      return { status: PermissionStatus.UNDETERMINED, expires: 'never' };
    } else {
      // TODO: Bacon: [OSX] The system could deny access to chrome.
      // TODO: Bacon: add: { status: 'unimplemented' }
      // message: Permission denied
      return { status: PermissionStatus.DENIED, expires: 'never' };
    }
  }
}

async function askForMicrophonePermissionAsync(): Promise<PermissionInfo> {
  return await askForMediaPermissionAsync({ audio: true });
}

async function askForCameraPermissionAsync(): Promise<PermissionInfo> {
  return await askForMediaPermissionAsync({ video: true });
}

async function askForLocationPermissionAsync(): Promise<PermissionInfo> {
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      () => resolve({ status: PermissionStatus.GRANTED, expires: 'never' }),
      ({ code }: PositionError) => {
        // https://developer.mozilla.org/en-US/docs/Web/API/PositionError/code
        if (code === 1) {
          resolve({ status: PermissionStatus.DENIED, expires: 'never' });
        } else {
          resolve({ status: PermissionStatus.UNDETERMINED, expires: 'never' });
        }
      }
    );
  });
}

async function getPermissionWithQueryAsync(name: PermissionName): Promise<PermissionStatus | null> {
  if (!navigator || !navigator.permissions || !navigator.permissions.query) return null;

  const { state } = await navigator.permissions.query({ name });
  if (state === 'prompt') {
    return PermissionStatus.UNDETERMINED;
  } else if (state === 'granted') {
    return PermissionStatus.GRANTED;
  } else if (state === 'denied') {
    return PermissionStatus.DENIED;
  }
  return null;
}

async function enumerateDevices(): Promise<MediaDeviceInfo[] | null> {
  if (navigator && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    return await navigator.mediaDevices.enumerateDevices();
  }

  // @ts-ignore: This is deprecated but we should still attempt to use it.
  if (window.MediaStreamTrack && typeof window.MediaStreamTrack.getSources === 'function') {
    // @ts-ignore
    return await MediaStreamTrack.getSources();
  }
  return null;
}

async function getMediaMaybeGrantedAsync(targetKind: MediaDeviceKind): Promise<boolean> {
  const devices = await enumerateDevices();
  if (!devices) {
    return false;
  }
  const result = await devices
    .filter(({ kind }) => kind === targetKind)
    .some(({ label }) => label !== '');
  // Granted or denied or undetermined or no devices
  return result;
}

async function getPermissionAsync(
  permission: PermissionType,
  shouldAsk: boolean
): Promise<PermissionInfo> {
  switch (permission) {
    case 'userFacingNotifications':
    case 'notifications':
      {
        if (!shouldAsk) {
          const status = await getPermissionWithQueryAsync('notifications');
          if (status) {
            return { status, expires: 'never' };
          }
        }

        const { Notification = {} } = window as any;
        if (Notification.requestPermission) {
          let status = Notification.permission;
          if (shouldAsk) {
            status = await Notification.requestPermission();
          }
          if (!status || status === 'default') {
            return { status: PermissionStatus.UNDETERMINED, expires: 'never' };
          }
          return { status, expires: 'never' };
        }
      }
      break;
    case 'location':
      {
        const maybeStatus = await getPermissionWithQueryAsync('geolocation');
        if (maybeStatus) {
          if (maybeStatus === PermissionStatus.UNDETERMINED && shouldAsk) {
            return await askForLocationPermissionAsync();
          }
          return { status: maybeStatus, expires: 'never' };
        } else if (shouldAsk) {
          // TODO: Bacon: should this function as ask async when not in chrome?
          return await askForLocationPermissionAsync();
        }
      }
      break;
    case 'audioRecording':
      {
        const maybeStatus = await getPermissionWithQueryAsync('microphone');
        if (maybeStatus) {
          if (maybeStatus === PermissionStatus.UNDETERMINED && shouldAsk) {
            return await askForMicrophonePermissionAsync();
          }
          return { status: maybeStatus, expires: 'never' };
        } else if (shouldAsk) {
          return await askForMicrophonePermissionAsync();
        } else {
          const maybeGranted = await getMediaMaybeGrantedAsync('audioinput');
          if (maybeGranted) {
            return { status: PermissionStatus.GRANTED, expires: 'never' };
          }
          // TODO: Bacon: Get denied or undetermined...
        }
      }
      break;
    case 'camera':
      {
        const maybeStatus = await getPermissionWithQueryAsync('camera');
        if (maybeStatus) {
          if (maybeStatus === PermissionStatus.UNDETERMINED && shouldAsk) {
            return await askForCameraPermissionAsync();
          }
          return { status: maybeStatus, expires: 'never' };
        } else if (shouldAsk) {
          return await askForCameraPermissionAsync();
        } else {
          const maybeGranted = await getMediaMaybeGrantedAsync('videoinput');
          if (maybeGranted) {
            return { status: PermissionStatus.GRANTED, expires: 'never' };
          }
          // TODO: Bacon: Get denied or undetermined...
        }
      }
      break;
    default:
      break;
  }
  return { status: PermissionStatus.UNDETERMINED, expires: 'never' };
}

export default {
  get name(): string {
    return 'ExpoPermissions';
  },

  async getAsync(permissionTypes: PermissionType[]): Promise<PermissionMap> {
    const results = {};
    for (const permissionType of new Set(permissionTypes)) {
      results[permissionType] = await getPermissionAsync(permissionType, /* shouldAsk */ false);
    }
    return results;
  },

  async askAsync(permissionTypes: PermissionType[]): Promise<PermissionMap> {
    const results = {};
    for (const permissionType of new Set(permissionTypes)) {
      results[permissionType] = await getPermissionAsync(permissionType, /* shouldAsk */ true);
    }
    return results;
  },
};
