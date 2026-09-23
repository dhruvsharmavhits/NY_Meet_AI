import boto3

from app.config import settings

_meetings_client = None
_media_pipelines_client = None


def _meetings() -> "boto3.client":
    global _meetings_client
    if _meetings_client is None:
        _meetings_client = boto3.client("chime-sdk-meetings", region_name=settings.aws_chime_control_region)
    return _meetings_client


def _media_pipelines() -> "boto3.client":
    global _media_pipelines_client
    if _media_pipelines_client is None:
        _media_pipelines_client = boto3.client(
            "chime-sdk-media-pipelines", region_name=settings.aws_chime_control_region
        )
    return _media_pipelines_client


def create_meeting(external_meeting_id: str) -> dict:
    response = _meetings().create_meeting(
        ClientRequestToken=external_meeting_id,
        ExternalMeetingId=external_meeting_id,
        MediaRegion=settings.aws_chime_media_region,
    )
    return response["Meeting"]


def get_meeting(chime_meeting_id: str) -> dict:
    response = _meetings().get_meeting(MeetingId=chime_meeting_id)
    return response["Meeting"]


def delete_meeting(chime_meeting_id: str) -> None:
    _meetings().delete_meeting(MeetingId=chime_meeting_id)


def create_attendee(chime_meeting_id: str, external_user_id: str) -> dict:
    response = _meetings().create_attendee(MeetingId=chime_meeting_id, ExternalUserId=external_user_id)
    return response["Attendee"]


def start_composited_capture(chime_meeting_arn: str, s3_bucket: str, s3_prefix: str) -> dict:
    sink_arn = f"arn:aws:s3:::{s3_bucket}/{s3_prefix}"
    response = _media_pipelines().create_media_capture_pipeline(
        SourceType="ChimeSdkMeeting",
        SourceArn=chime_meeting_arn,
        SinkType="S3Bucket",
        SinkArn=sink_arn,
        ChimeSdkMeetingConfiguration={
            "ArtifactsConfiguration": {
                "Audio": {"MuxType": "AudioWithCompositedVideo"},
                "Video": {"State": "Disabled"},
                "Content": {"State": "Disabled"},
                "CompositedVideo": {
                    "Layout": "GridView",
                    "Resolution": "HD",
                    "GridViewConfiguration": {"ContentShareLayout": "Horizontal"},
                },
            }
        },
    )
    return response["MediaCapturePipeline"]


def stop_composited_capture(media_pipeline_id: str) -> None:
    _media_pipelines().delete_media_capture_pipeline(MediaPipelineId=media_pipeline_id)


def start_concatenation(capture_pipeline_arn: str, s3_bucket: str, s3_prefix: str) -> dict:
    """The capture pipeline writes rolling video fragments as the meeting
    progresses, not one continuous file — concatenation is what stitches
    those fragments into the single playable recording admins download."""
    sink_arn = f"arn:aws:s3:::{s3_bucket}/{s3_prefix}"
    response = _media_pipelines().create_media_concatenation_pipeline(
        Sources=[
            {
                "Type": "MediaCapturePipeline",
                "MediaCapturePipelineSourceConfiguration": {
                    "MediaPipelineArn": capture_pipeline_arn,
                    "ChimeSdkMeetingConfiguration": {
                        "ArtifactsConfiguration": {
                            "CompositedVideo": {"State": "Enabled"},
                            "Audio": {"State": "Enabled"},
                            "Content": {"State": "Disabled"},
                            "Video": {"State": "Disabled"},
                            "DataChannel": {"State": "Disabled"},
                            "MeetingEvents": {"State": "Disabled"},
                            "TranscriptionMessages": {"State": "Disabled"},
                        }
                    },
                },
            }
        ],
        Sinks=[{"Type": "S3Bucket", "S3BucketSinkConfiguration": {"Destination": sink_arn}}],
    )
    return response["MediaConcatenationPipeline"]
