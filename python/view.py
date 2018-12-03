#有关即时聊天室的一切就在这个空间内
def chat(request,me,friend,token):
    query1 = Base.create_connection_with_dbs("_User").select("avatar").equal_to("objectId",me)
    query2 = Base.create_connection_with_dbs("_User").select("avatar").equal_to("objectId",friend)
    if not query1.count() or not query2.count() or me == friend:
        return HttpResponse("you do not love me but I do")  
    users = leancloud.Query.or_(*(query1,query2)).find()
    for user in users:
        if user.id == me:
            me_to_response = user.get("avatar").url + "?" + me
        else:
            friend_to_response = user.get("avatar").url + "?" + friend
    chat_user_query = Base.create_connection_with_dbs("ChatUser").select("chatId").equal_to("userId",me).equal_to("friendId",friend)
    if chat_user_query.count():
        if not chat_user_query.equal_to("secretsToken",token).count():
            return HttpResponse("you do not love me but I do")
        chat_room_id = chat_user_query.first().get("chatId")
    else:
        chat_room_id = create_chat_room(me,friend)
    return render(request, 'chat/chat.html',{"me":me_to_response,"friend":friend_to_response,"chat_id":chat_room_id})
def receive_message(request,friend_chatid):
    friend_chatid = friend_chatid.split("_")
    friend_id = friend_chatid[0]
    chat_id = friend_chatid[1]
    messages = get_new_ten_messages_order_from_old_to_new_from_db(friend_id,chat_id,request.GET.get("latest_message_date",None))
    return HttpResponse(json.dumps({"messages":messages}), content_type="application/json")  
def send_message(request):
    save_my_messages_to_db(request.POST.get("messages",[]))
    return HttpResponse(True)
def get_new_ten_messages_order_from_old_to_new_from_db(friend_id,chat_id,latest_message_date):
    if latest_message_date:
        messages = Base.create_connection_with_dbs("Message").select("message","createdAt").equal_to("chatId", chat_id).equal_to("userId", friend_id).greater_than("createdAt", latest_message_date).add_ascending("createdAt").limit(10).find()
    else:
        try:
            message = Base.create_connection_with_dbs("Message").select("createdAt").equal_to("chatId", chat_id).equal_to("userId", friend_id).equal_to("isRead", True).add_descending("createdAt").first()
        except:
            message = None
        if message:
            messages = Base.create_connection_with_dbs("Message").select("message","createdAt").equal_to("chatId", chat_id).equal_to("userId", friend_id).greater_than("createdAt", message.get("createdAt")).add_ascending("createdAt").limit(10).find()
        else:
            messages = Base.create_connection_with_dbs("Message").select("message","createdAt").equal_to("chatId", chat_id).equal_to("userId", friend_id).add_ascending("createdAt").limit(10).find()
    messages_transformed = []
    for message in messages:
        message_object = {}
        message_object["message"] = message.get("message")
        message_object["createdAt"] = str(message.get("createdAt")+timedelta(hours=8))
        message_object["chatId"] = chat_id
        message_object["userId"] = friend_id
        messages_transformed.append(message_object)
    if messages:
        update_all_read_message_to_read(messages)
    return messages_transformed
def save_my_messages_to_db(messages):
    if messages:
        messages = json.loads(messages)
    else:
        return 
    messages_ready_to_be_batch_save = []
    for message in messages:
        message.pop("id")
        message.pop("isWaitingForsent")
        message.pop("isSavedToServer")
        message.pop("createdAt")
        messages_ready_to_be_batch_save.append(Base.create_new_record("Message",**message))
    leancloud.Object.extend("Message").save_all(messages_ready_to_be_batch_save)
def update_all_read_message_to_read(messages):
    messages_transformed = []
    for m in messages:
        m.set("isRead",True)
        messages_transformed.append(m)
    leancloud.Object.extend("Message").save_all(messages_transformed)
def create_chat_room(me_id,friend_id):
    chat = Base.create_new_record("Chat")
    chat.save()
    chat_id = chat.id
    import hashlib
    from datetime import datetime
    hex_secrets = hashlib.sha256()
    hex_secrets.update(bytes(str(chat_id)+str(datetime.now().timestamp()),"utf8"))
    me_in_chat_room = Base.create_new_record("ChatUser",**{"userId":me_id,"chatId":chat_id,"friendId":friend_id,"secretsToken":hex_secrets.hexdigest()})
    hex_secrets.update(bytes(str(chat_id),"utf8"))
    friend_in_chat_room = Base.create_new_record("ChatUser",**{"userId":friend_id,"chatId":chat_id,"friendId":me_id,"secretsToken":hex_secrets.hexdigest()})
    leancloud.Object.extend("ChatUser").save_all([me_in_chat_room,friend_in_chat_room])
    return chat_id
####chat------------------------chat#########