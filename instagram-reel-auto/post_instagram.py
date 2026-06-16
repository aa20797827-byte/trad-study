"""Instagram Graph API를 통해 릴스 업로드"""

import requests
import time
import os
import logging

log = logging.getLogger(__name__)

API_VERSION = "v21.0"
GRAPH = f"https://graph.facebook.com/{API_VERSION}"


def post_reel(video_path: str, caption: str, config: dict) -> dict:
    token = config['instagram']['access_token']
    user_id = config['instagram']['user_id']

    # 1. 업로드 세션 생성
    log.info("업로드 세션 생성 중...")
    container_id, upload_uri = _create_upload_session(user_id, token, caption)
    if not container_id:
        return {'success': False, 'error': '업로드 세션 생성 실패 (토큰/User ID 확인)'}

    log.info(f"컨테이너 ID: {container_id}")

    # 2. 영상 업로드
    log.info(f"영상 업로드 중... ({os.path.getsize(video_path) / 1024 / 1024:.1f} MB)")
    if not _upload_video(upload_uri, video_path, token):
        return {'success': False, 'error': '영상 파일 업로드 실패'}

    log.info("업로드 완료, Meta 처리 대기 중...")

    # 3. 처리 완료 대기 (최대 5분)
    for attempt in range(30):
        time.sleep(10)
        status = _check_status(container_id, token)
        log.info(f"  처리 상태: {status} ({(attempt + 1) * 10}초)")
        if status == 'FINISHED':
            break
        if status == 'ERROR':
            return {'success': False, 'error': '영상 처리 중 오류 발생'}
    else:
        return {'success': False, 'error': '처리 대기 시간 초과 (5분)'}

    # 4. 게시
    log.info("게시 중...")
    post_id = _publish(user_id, container_id, token)
    if post_id:
        return {'success': True, 'post_id': post_id}
    return {'success': False, 'error': '게시 요청 실패'}


def _create_upload_session(user_id, token, caption):
    response = requests.post(
        f"{GRAPH}/{user_id}/media",
        params={
            'media_type': 'REELS',
            'upload_type': 'resumable',
            'caption': caption,
            'share_to_feed': 'true',
            'access_token': token,
        }
    )
    data = response.json()
    if 'error' in data:
        log.error(f"API 오류: {data['error'].get('message', data['error'])}")
        return None, None
    return data.get('id'), data.get('uri')


def _upload_video(upload_uri, video_path, token):
    file_size = os.path.getsize(video_path)
    with open(video_path, 'rb') as f:
        video_data = f.read()

    response = requests.post(
        upload_uri,
        headers={
            'Authorization': f'OAuth {token}',
            'offset': '0',
            'file_size': str(file_size),
            'Content-Type': 'application/octet-stream',
        },
        data=video_data
    )
    if response.status_code != 200:
        log.error(f"업로드 HTTP {response.status_code}: {response.text[:300]}")
        return False
    return True


def _check_status(container_id, token):
    response = requests.get(
        f"{GRAPH}/{container_id}",
        params={'fields': 'status_code', 'access_token': token}
    )
    return response.json().get('status_code', 'UNKNOWN')


def _publish(user_id, container_id, token):
    response = requests.post(
        f"{GRAPH}/{user_id}/media_publish",
        params={'creation_id': container_id, 'access_token': token}
    )
    data = response.json()
    if 'error' in data:
        log.error(f"게시 오류: {data['error'].get('message', data['error'])}")
        return None
    return data.get('id')
