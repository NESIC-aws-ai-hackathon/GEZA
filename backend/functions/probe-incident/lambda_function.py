import json
from shared.decorators import handle_errors


@handle_errors
def lambda_handler(event, context):
    # TODO: U2 で実装予定
    return {
        "statusCode": 200,
        "body": json.dumps({"message": "stub"}, ensure_ascii=False),
    }
