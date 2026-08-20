from flask import Flask, render_template, request, jsonify, Response
from flask_cors import CORS
import requests
import threading
import queue
import time
import os
import sys

app = Flask(__name__)
CORS(app)

# Queue for streaming logs
log_queue = queue.Queue()

class DiscordCloner:
    def __init__(self, token):
        self.token = token
        self.headers = {
            'Authorization': token,
            'Content-Type': 'application/json'
        }
        self.base_url = 'https://discord.com/api/v10'
    
    def verify_token(self):
        try:
            response = requests.get(f'{self.base_url}/users/@me', headers=self.headers)
            if response.status_code == 200:
                data = response.json()
                return True, data['username']
            return False, 'Invalid token'
        except Exception as e:
            return False, str(e)
    
    def get_guilds(self):
        try:
            response = requests.get(f'{self.base_url}/users/@me/guilds', headers=self.headers)
            if response.status_code == 200:
                return True, response.json()
            return False, 'Failed to fetch guilds'
        except Exception as e:
            return False, str(e)
    
    def clone_server(self, source_id, target_id):
        try:
            log_queue.put('Starting cloning process...')
            
            # Get source server info
            log_queue.put('Fetching source server info...')
            source_response = requests.get(f'{self.base_url}/guilds/{source_id}', headers=self.headers)
            if source_response.status_code != 200:
                log_queue.put('Failed to fetch source server')
                return False
            
            source_data = source_response.json()
            
            # Clean target server
            log_queue.put('Cleaning target server...')
            self.clean_server(target_id)
            
            # Update server info
            log_queue.put('Updating server info...')
            self.update_server_info(target_id, source_data)
            
            # Copy roles
            log_queue.put('Copying roles...')
            self.copy_roles(source_id, target_id)
            
            # Copy channels
            log_queue.put('Copying channels...')
            self.copy_channels(source_id, target_id)
            
            # Copy emojis
            log_queue.put('Copying emojis...')
            self.copy_emojis(source_id, target_id)
            
            log_queue.put('Cloning completed successfully!')
            return True
            
        except Exception as e:
            log_queue.put(f'Error during cloning: {str(e)}')
            return False
    
    def clean_server(self, guild_id):
        try:
            # Delete all channels
            channels_response = requests.get(f'{self.base_url}/guilds/{guild_id}/channels', headers=self.headers)
            if channels_response.status_code == 200:
                channels = channels_response.json()
                for channel in channels:
                    requests.delete(f'{self.base_url}/channels/{channel["id"]}', headers=self.headers)
            
            # Delete all roles (except @everyone)
            roles_response = requests.get(f'{self.base_url}/guilds/{guild_id}/roles', headers=self.headers)
            if roles_response.status_code == 200:
                roles = roles_response.json()
                for role in roles:
                    if role['name'] != '@everyone':
                        requests.delete(f'{self.base_url}/guilds/{guild_id}/roles/{role["id"]}', headers=self.headers)
        except Exception as e:
            log_queue.put(f'Error cleaning server: {str(e)}')
    
    def update_server_info(self, target_id, source_data):
        try:
            data = {
                'name': source_data.get('name', 'New Server'),
                'description': source_data.get('description', ''),
                'icon': source_data.get('icon', None),
                'banner': source_data.get('banner', None)
            }
            requests.patch(f'{self.base_url}/guilds/{target_id}', headers=self.headers, json=data)
        except Exception as e:
            log_queue.put(f'Error updating server info: {str(e)}')
    
    def copy_roles(self, source_id, target_id):
        try:
            response = requests.get(f'{self.base_url}/guilds/{source_id}/roles', headers=self.headers)
            if response.status_code == 200:
                roles = response.json()
                for role in roles:
                    if role['name'] != '@everyone':
                        role_data = {
                            'name': role['name'],
                            'color': role['color'],
                            'hoist': role['hoist'],
                            'mentionable': role['mentionable'],
                            'permissions': str(role['permissions'])
                        }
                        requests.post(f'{self.base_url}/guilds/{target_id}/roles', headers=self.headers, json=role_data)
        except Exception as e:
            log_queue.put(f'Error copying roles: {str(e)}')
    
    def copy_channels(self, source_id, target_id):
        try:
            response = requests.get(f'{self.base_url}/guilds/{source_id}/channels', headers=self.headers)
            if response.status_code == 200:
                channels = response.json()
                for channel in channels:
                    channel_data = {
                        'name': channel['name'],
                        'type': channel['type'],
                        'topic': channel.get('topic', ''),
                        'position': channel.get('position', 0)
                    }
                    requests.post(f'{self.base_url}/guilds/{target_id}/channels', headers=self.headers, json=channel_data)
        except Exception as e:
            log_queue.put(f'Error copying channels: {str(e)}')
    
    def copy_emojis(self, source_id, target_id):
        try:
            response = requests.get(f'{self.base_url}/guilds/{source_id}/emojis', headers=self.headers)
            if response.status_code == 200:
                emojis = response.json()
                for emoji in emojis:
                    emoji_data = {
                        'name': emoji['name'],
                        'image': emoji['image']
                    }
                    requests.post(f'{self.base_url}/guilds/{target_id}/emojis', headers=self.headers, json=emoji_data)
        except Exception as e:
            log_queue.put(f'Error copying emojis: {str(e)}')

@app.route('/')
def index():
    try:
        return render_template('index.html')
    except Exception as e:
        return f"Error loading template: {str(e)}", 500

@app.route('/api/verify', methods=['POST'])
def verify_token():
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        token = data.get('token')
        if not token:
            return jsonify({'success': False, 'error': 'No token provided'}), 400
        
        cloner = DiscordCloner(token)
        success, result = cloner.verify_token()
        
        if success:
            return jsonify({'success': True, 'username': result})
        else:
            return jsonify({'success': False, 'error': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/guilds', methods=['POST'])
def get_guilds():
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        token = data.get('token')
        if not token:
            return jsonify({'success': False, 'error': 'No token provided'}), 400
        
        cloner = DiscordCloner(token)
        success, result = cloner.get_guilds()
        
        if success:
            guilds = [{'id': g['id'], 'name': g['name']} for g in result]
            return jsonify({'success': True, 'guilds': guilds})
        else:
            return jsonify({'success': False, 'error': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/clone', methods=['POST'])
def clone_server():
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        token = data.get('token')
        source_id = data.get('source_id')
        target_id = data.get('target_id')
        
        if not all([token, source_id, target_id]):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        # Start cloning in background thread
        cloner = DiscordCloner(token)
        thread = threading.Thread(target=cloner.clone_server, args=(source_id, target_id))
        thread.start()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/logs')
def stream_logs():
    def generate():
        while True:
            try:
                message = log_queue.get(timeout=1)
                yield f"data: {message}\n\n"
            except queue.Empty:
                yield ": keep-alive\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

if __name__ == '__main__':
    try:
        port = int(os.environ.get('PORT', 8080))
        print(f"Starting Flask app on port {port}")
        app.run(host='0.0.0.0', port=port, debug=False)
    except Exception as e:
        print(f"Error starting app: {e}")
        sys.exit(1)
