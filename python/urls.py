# coding: utf-8
from django.conf.urls import include, url
from django.conf import settings
from django.conf.urls.static import static
import django
from django.conf.urls import url, include
from django.contrib.auth.models import User

chatUrl = [
	url(r'^Share/Private/Msg/(?P<me>.+?)/(?P<friend>.+?)/(?P<token>.*?)/?$', views.chat),
    url(r'^Share/Private/Msg/receive/(?P<friend_chatid>.+)/$', views.receive_message),
    url(r'^Share/Private/Msg/send/$', views.send_message),
]
