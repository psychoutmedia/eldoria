"""
Astra-MUD: LLM Backend
Abstraction for Ollama / OpenAI inference
"""

import aiohttp
import json
from typing import AsyncIterator, Optional
from dataclasses import dataclass


@dataclass
class LLMResponse:
    content: str
    model: str
    done: bool = True


class LLMBackend:
    """Base class for LLM backends."""
    
    async def chat(self, messages: list[dict], model: str = "phi3") -> LLMResponse:
        raise NotImplemented
    
    async def stream(self, messages: list[dict], model: str = "phi3") -> AsyncIterator[str]:
        raise NotImplemented


class OllamaBackend(LLMBackend):
    """Ollama local inference."""
    
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
    
    async def chat(self, messages: list[dict], model: str = "phi3") -> LLMResponse:
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise Exception(f"Ollama error: {resp.status} - {text}")
                
                data = await resp.json()
                return LLMResponse(
                    content=data["message"]["content"],
                    model=model,
                )
    
    async def stream(self, messages: list[dict], model: str = "phi3") -> AsyncIterator[str]:
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise Exception(f"Ollama error: {resp.status} - {text}")
                
                async for line in resp.content:
                    if line:
                        try:
                            data = json.loads(line)
                            if "message" in data and "content" in data["message"]:
                                yield data["message"]["content"]
                            if data.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue


class OpenAIBackend(LLMBackend):
    """OpenAI API (or compatible)."""
    
    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        self.api_key = api_key
        self.base_url = base_url
    
    async def chat(self, messages: list[dict], model: str = "gpt-4o") -> LLMResponse:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise Exception(f"OpenAI error: {resp.status} - {text}")
                
                data = await resp.json()
                return LLMResponse(
                    content=data["choices"][0]["message"]["content"],
                    model=model,
                )
    
    async def stream(self, messages: list[dict], model: str = "gpt-4o") -> AsyncIterator[str]:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise Exception(f"OpenAI error: {resp.status} - {text}")
                
                async for line in resp.content:
                    if line:
                        line = line.decode("utf-8")
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                                if "choices" in data and data["choices"]:
                                    delta = data["choices"][0].get("delta", {})
                                    if "content" in delta:
                                        yield delta["content"]
                            except json.JSONDecodeError:
                                continue


def get_backend(backend_type: str = "ollama", **kwargs) -> LLMBackend:
    """Factory to get LLM backend."""
    if backend_type == "ollama":
        return OllamaBackend(base_url=kwargs.get("base_url", "http://localhost:11434"))
    elif backend_type == "openai":
        return OpenAIBackend(
            api_key=kwargs["api_key"],
            base_url=kwargs.get("base_url", "https://api.openai.com/v1"),
        )
    else:
        raise ValueError(f"Unknown backend: {backend_type}")
